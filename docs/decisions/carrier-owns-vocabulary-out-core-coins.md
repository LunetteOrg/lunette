---
title: "A carrier owns its vocabulary, in and out; the core coins none"
area: scope-runtime
status: accepted
---

# A carrier owns its vocabulary, in and out; the core coins none

**SUPERSEDED by [a carrier being `__args` alone](./carrier-needs-no-vocabulary-at-all.md).** This decision's premise — that a carrier needs a
vocabulary of words at all, for the outcome to be sayable and for validation to
have somewhere to fail — is what #76 measured against and found unnecessary.
Composing on four real hosts with plain `.step()` and a carrier that is `__args`
alone, with no shared word, produced no duplication and no silent failure that a
vocabulary would have caught but composition did not. The two failures this
decision closes (a scope saying a word its carrier does not coin; a host unable
to render a word a scope says) cannot recur, because there is no word — not
because the gate got better. Kept below as the record of what was tried, why,
and what it cost; not as the current contract.

**Decision.** [The capability gate](./carrier-capabilities-gate-host-portability-body.md) got HTTP out of the scope's INPUT — `request`, `body`,
`cookies`, `headers` became tree-shakable subpaths, each coining its own
capability, with the core naming none of them. The OUTCOME half never made that
move: `abort.ts` sat in the core and spoke HTTP with no mediation
(`ResponseIntent = redirect | status`, plus `httpError`/`unauthorized`/
`forbidden`/`notFound`), so `scope()` was agnostic about what came in and not
about what went out. Worse, `validate.ts` did not merely TYPE HTTP, it MINTED
it: a schema rejection returned `httpError(422, …)` from inside the fold.

The rule that replaces it is one turn sharper than the one 34 was written
against: **every carrier extension owns its own vocabulary — the verbs it
offers AND the outcomes it can express.** `notFound()` means nothing on a CLI,
and a shared "semantic" vocabulary would be HTTP in disguise. The rule reaches
the input side too, which is why `.input` left the core in the same change: one
verb that silently meant "route params" on Hono and "the whole payload" on tRPC
was the same fusion seen from the other end. `@lntt/scope/http` coins
`.params(schema)`, `.status(n)`, `ctx.request` and its words;
`@lntt/scope/trpc` coins `.input(schema)`, `ctx.request` and codes, and no
`redirect` — an RPC reply has nowhere to go. A bare `scope()` has neither an
input channel nor a way to abort, which is correct: a scope with no carrier
runs nowhere.

**Two failures, two lines, two culprits.** They are different mistakes and the
gate reads the same accumulated set twice:

1. **The SCOPE does not handle that verb** — a guard returns `redirect()` on a
   scope that never extended the carrier coining it. Caught at the DEFINITION,
   on the guard argument.
2. **The HOST does not handle that scope** — the scope declared `redirect`
   correctly and is mounted on tRPC. Caught at the MOUNT. It cannot move
   earlier: the same scope is correct on Hono, and the definition line holds no
   information about the host.

Both compiled before: (1) because the constructors were free barrel exports
with no link to `.extend`, (2) because `abortToTRPCError` degraded a redirect
to `PRECONDITION_FAILED` in silence.

Nothing is declared by hand. Each verb carries its own name in its type
(`Abort<{ redirect: true }>`), `.guard`/`.handle` accumulate it, and the set is
compared once against what the scope extended and once against what the host
renders. The intent set is a MAP, not a union, so intersection accumulates and
`keyof` reads the union back — the trick the capability axis already uses. The
phantom is invariant for the reason [the capability gate](./carrier-capabilities-gate-host-portability-body.md) gives.

**What the core keeps.** The `ABORT`/`OK` brands, `isAbort`/`isOk`, and the
fold. It never reads an intent. Its own failure — a schema rejection — is NOT
an abort, because an abort is a word from a carrier's vocabulary and the core
has none; it became a THIRD branch of `Outcome` (`{ ok: false, invalid: {
issues } }`). No coined name, no exemption, and exhaustiveness makes a codec
that forgets the branch fail to compile — verified by deleting it. `Prepare`
widened to carry it too, since `.body()`/`.form()` validate inside a prepare
step. Deciding those issues are worth 422 is the CODEC's job now (422 and not
400, so it stays distinct from Hono's native `sValidator` 400).

**Four things that were surprises, each measured rather than reasoned.**

The intent CANNOT be inferred from inside a union constituent. Written the
obvious way (`g: (ctx) => E | Abort<I>`), two abort constituents make
TypeScript pick the first candidate and REJECT the second, so a guard that can
return two different intents stops compiling. Variance does not help —
invariant, covariant and contravariant phantoms behave identically — and
inferring the whole abort union collapses to the constraint — the same negative [the mount signature's type
parameters](./mount-signature-type-parameters-stay-parameter.md) record, reproduced. Inferring the whole RETURN type and distributing
afterwards collects every constituent.

The gate belongs on the ARGUMENT, not in the return type. The return-type form
is cheaper (616 instantiations per scope against 780) and was chosen first,
then reversed: it only fires when the next call touches the poisoned type, so a
BASE — extends and guards, no `.handle`, the shape a shared gated base has —
compiles clean and defers the mistake to whichever file finally calls
`.handle`, pointing at a guard its author never wrote. 39(b) rejects
return-type brands for the same reason. Its other trap does not apply: this
gate is a conditional over `R`, not an inference site, so `R` still infers.

The success side needs its OWN word. `json(v, 201)` first coined the same
`status` intent as `notFound()`, and because tRPC legitimately declares it
renders status aborts, that shared name silently licensed a 201 it cannot
express. `'ok-status'` closes it.

A bare `Abort` must fail CLOSED (`UnknownIntent`), never collapse to `never` —
the fail-open shape [the capability gate](./carrier-capabilities-gate-host-portability-body.md) refused. The consequence reaches every call site: annotating a
guard `Promise<{ post } | Abort>` ERASES the intent the constructor declared
before the gate sees it, so those annotations are DROPPED and the return type
inferred. An alias to annotate with was considered and rejected: it
reintroduces exactly the promise-to-keep-aligned this change removes.

**The route pattern is CHECKED against the schema, never extracted.** They were
two independent declarations nothing kept aligned — renaming `:postId` to
`:wrongName` produced no error at any mount and failed at runtime with a 422.
Matching stays the framework's job: it owns the pattern language, and the URL a
scope reads is NORMALISED while the router matched the raw target, so an
extractor of ours could disagree with it on `/a/../b`. And we write no parser:
each framework already knows its own params and hands us the type — Hono's
`ParamKeys`, Express's `RouteParameters` from `@types/express-serve-static-core`,
React Router's per-route typegen. Both framework readers beat a hand-written one
measured against them (Express's understands `*path` and `{/:id}`; Hono's knows
a wildcard names nothing). tRPC has no path, so no gate. The rule that keeps it
safe: on a pattern it cannot read it has NO OPINION — catching less is fine,
rejecting a valid route is not, and two of the three bugs found writing the
hand-rolled version were exactly that.

One trap paid for here and worth naming: a route with no params reads as
`never`, and `never extends Opaque` is VACUOUSLY TRUE, so the natural spelling
of the bail-out skipped the check on every param-less route. A tuple wrap does
not help — `never` is assignable to anything. Only the reversed test does. Same
vacuous-truth trap 34 closed on `Exclude`, in a new place.

**Cost.** Both sides measured on the same machine, the before from a separate
worktree at the pre-change commit rather than from a figure in a file — which
is the discipline this record needs more than the number: the previously
recorded 134,614 was already stale, and reading it as the "before" turned a
+7.5% change into a reported +65%. Across `examples/app`: 207,153 → 222,755
instantiations (+7.5%), 55,213 → 58,387 types, check 0.36s → 0.41s. That covers
three things at once — the per-scope machinery, the route gate, and the example
growing from 15 scopes to 18. On a fixed scope count the machinery measured
+4.1% with the argument-position gate; it is nearly free to HAVE (+0.8% at zero
scopes) and paid per scope, 250 → 615 instantiations, linearly.

**Alternatives.** (a) Constructors reached through `ctx` (`ctx.http.notFound()`)
— a certain guarantee, since the ctx lacks the field until you extend. Rejected:
it grows every guard and leaf signature and forces their unit tests to fabricate
a dependency to satisfy a gate, which is the thing the pure-function handler
style exists to avoid. (b) A shared semantic vocabulary (`notFound` meaning "not
found" on any carrier) with per-host rendering. Rejected: it is HTTP in disguise
and means nothing on a CLI. (c) Reusing the capability alphabet for intents
instead of a second axis. Rejected: tRPC's supply set would go from `never` to
two names and the same list would say two different things — what the carrier
supplies on input, and what the mount renders on output. (d) `invalidInput()` as
an ordinary abort with a neutral name: it touches no contract, but needs an
exemption from the definition-side gate, encoding "the core may do the thing we
just called a bug". (e) A success status collected through a runtime sink alone.
Rejected: it erases the literal and degrades a host's response-type inference
for EVERY route on the pack, not just the ones using it.

**Why.** The capability axis made a bad mount impossible on the input side; the
outcome side had the same shape of mistake and no gate at all. Reusing the same
brand machinery adds no concept — one more phantom, read with `keyof`, named
keys — and it keeps the future collision gate of #51 applicable to it. What it buys
is that the core stops knowing what a 404 is, exactly as it does not know what a
cookie is, and that a host receiving an intent it cannot render is a compile
error naming the intent rather than a silent degradation.

**Deferred.** The type-efficiency pass (780 → 615 instantiations per scope) is
its own issue, including the finding that hoisting the gate's let-bindings onto
a method's own type-parameter list is both slower and reopens the hole [the capability gate](./carrier-capabilities-gate-host-portability-body.md)
closed:
`guard<…, never>(bad)` then satisfies the gate AND empties the accumulated set.
On a type ALIAS the caller cannot reach them.
