---
title: "Carrier capabilities gate host portability; the body is a declared channel"
area: scope-runtime
status: accepted
---

# Carrier capabilities gate host portability; the body is a declared channel

**Decision.** A scope's input splits by SOURCE, and each host maps `.input`
to its own native notion — SUPERSEDED by [the vocabulary a carrier owns](./carrier-owns-vocabulary-out-core-coins.md), which gives the verb to
the carrier instead (`.params` on HTTP, `.input` on tRPC) so one name no longer
means two things; the rest of this decision, and the capability gate above all,
stands: the HTTP hosts (Hono/Express/React Router) map it to
the ROUTE PARAMS (validated by the native `param` validator), while tRPC maps it
to the single RPC payload. The request BODY is therefore NOT `.input`; it is a
SEPARATE, DECLARED channel — `.body(schema)` for JSON, `.form(schema)` for
multipart/urlencoded — validated into `ctx.body` / `ctx.form` by the fold. A
scope that declares either carries the `body` **capability** in its `Cap`
axis (a phantom on `Handler`, load-bearing like `__need`/`__result`).

Each host adapter declares the capabilities its carrier PROVIDES (`'body' |
'cookies' | 'headers'` for Hono/Express/RR7; NONE for tRPC — one JSON `input`, no
separate readable body, and it drops `Set-Cookie`) and intersects the wiring parameter
with `CarrierGuard<Cap, HostCaps>` — the
same brand shape as `DepGuard` (`packages/scope/src/adapter-guard.ts`). When `Cap ⊆
HostCaps` the clause vanishes and the mount compiles; otherwise it becomes an
unsatisfiable branded object (`__ERROR_host_missing_capability`) and the mount
(`toProcedure`/`w.handler`/`toLoader`) is a COMPILE ERROR naming the gap.

Enforcement is by CONSTRUCTION, not by convention: `ctx.request` is narrowed to
a headless `RequestHead` (url/method/headers, NO body accessors), so the body is
UNREACHABLE except through the declared `.body`/`.form` channels. A guard cannot
call `ctx.request.json()` to sneak the body past the capability — it does not
typecheck. A missing capability is thus impossible to forget: reading the body
requires the declaration that flows `Cap`, which the gate reads.

**Amendment — the alphabet is OPEN, and the two sides are asymmetric.** As first
written, `Capability` was the closed union `'body' | 'cookies' | 'headers'` in
the core, and `CapsOf` filtered an extension's own `__caps` through it. That
contradicted principle 6 — extensions are dialects, the core names none — and it
did so in the worst possible direction: a third-party capability was not
rejected, it became `never`. `CarrierGuard<never, HostCaps>` collapses to
`unknown`, the brand vanishes, and the scope mounts ANYWHERE. A silent
fail-OPEN in the one mechanism whose entire job is to make a bad mount
impossible. The negative that keeps it shut is
`packages/scope/src/capability-alphabet.test-d.ts`.

`Capability` is now `string`. An extension coins its own names and the core
enumerates none. The safety does not rest on the core knowing the alphabet — it
rests on an asymmetry:

- **DEMAND (the scope) is OPEN.** Any extension may coin a name, and the name is
  carried through as it is. A capability no host has claimed appears in no
  `HostCaps`, so `Exclude` leaves it and the mount fails EVERYWHERE. A new
  capability mounts nowhere until a host claims it; a typo (`'bdy'`) fails the
  same way, naming the string.
- **SUPPLY (the mount) is CLOSED** — a written-out set in the adapter, or in the
  hand-written mount for a host we ship nothing for.

**The gate had to be made invariant, and the reason is not the one it looks
like.** Declared `(c: Cap) => void`, the capability phantom is contravariant, so
`Handler<…, 'body'>` is assignable to `Handler<…, never>`: a caller NAMING the
type arguments at a mount (`w.handler<…, never>(scope)`) satisfied the guard
while the scope still required a capability the carrier lacked, with no cast
anywhere. Inferred mounts — which is how every mount is actually written — were
never affected.

`DepGuard` was never exposed this way, and NOT because `Need` is somehow more
real: `__need` has the identical shape, a contravariant phantom. What differs is
the DIRECTION of each predicate against the bottom type. `DepGuard` asks
`Pub extends Need`, and `never` makes that FALSE — nothing extends `never` — so
the brand fires; naming a smaller object instead is refused earlier, by
contravariance, since the handler's own `Need` no longer fits the named one.
`CarrierGuard` asks whether `Exclude<Cap, HostCaps>` is `never`, which `never`
satisfies VACUOUSLY — and contravariance waves the value through, since `never`
is assignable to everything. One axis is protected on both moves, the other on
neither.

`__cap` is now `(c: Cap) => Cap`, present in both positions and therefore
invariant, which refuses the assignment. The ONLY assignment that becomes newly
illegal is NARROWING the capability slot by hand, which is the unsound direction.
Widening it, and collecting handlers of different capabilities in one array or
record, were already refused before — by contravariance, and independently by
`__need`/`__eff`/`__result` once real scopes differ on those axes too. Verified
by running the same probes against both trees with the real packs and real
scopes, rather than handlers whose other parameters were held artificially
uniform, which is what made an earlier reading of this wrong.

The gate was genuinely open at all five shipped mount sites (`toProcedure`,
`toMutation`, the Hono and Express `handler`, `toLoader`), each of which would
take a body-reading scope onto a carrier without a readable body when the type
arguments were named; all five now refuse it.

Cost measured on two trees that both COMPILE, which is the part easy to get
wrong — diagnostics are still emitted for a tree with type errors, and reading
those is how the first figure came out backwards. Across @lntt/integration:
274,353 → 274,347 instantiations, 101,990 → 101,985 types, check time within
noise. The change does not cost, it saves a little. The negative lives in
`capability-alphabet.test-d.ts`.

Every mistake therefore falls the safe way, and the rule that follows is worth
stating on its own: **narrowing a host's set is always legitimate — it only
rejects more. WIDENING is a claim about MACHINERY, so it belongs to whoever
supplies the machinery.** `body` works on Express because `toWebRequest` streams
the request into the Web `Request`; `cookies` and `headers` work because
`renderOutcome` writes both sinks. A capability name is the name of something
that exists, never a permission to be granted.

What the amendment does NOT do is make the SUPPLY side extensible: a caller
cannot widen a shipped pack's set, and the only way to serve a capability a pack
does not claim is to write the mount (which is also the answer to "you ship no
adapter for my host" — `examples/express/src/server-manual.ts` writes its
`HostCaps` out). Deferred deliberately: there is no second capability per host to
design against yet, and #41 (SSE, downloads, WebSocket upgrade) is where the
first real divergence will appear. Tracked as #44.

A capability, finally, exists because an EXTENSION demands one — not because a
host happens to be able to do something. The alphabet mirrors the extension set,
not an inventory of host abilities, so "does Express have more capabilities?"
only becomes answerable when something asks for one.

**Alternatives.** (a) Normalize all sources into one `.input` bag the adapter
assembles per host: rejected — auto-merging path/query/body is "ambient magic"
(principle 7), risks name collisions, and threatens the typed client (`hc` reads
Hono's native `param`/`json` split). (b) Content-type negotiation inside one
`.body` (json vs form auto-detected): the "magic" convenience, deferred until a
real case — explicit `.body`/`.form` first (principle 5, "one way to do each
thing"). (c) A declaration-only marker (`.reads('body')`) NOT enforced by the
carrier type: a scope could forget it and still read the body, so the gate
would give false safety; the headless `RequestHead` closes that hole. (d) A
runtime proxy whose `.json()` throws on a body-less host: turns a silent
empty-body read into a loud failure, but stays RUNTIME — kept only as a possible
backstop, not the primary mechanism.

**Why.** The capability axis is the `DepGuard` idiom applied to the carrier: the
same "brand at the wiring call site, named gap, compile error" the deps check
already gives — no new concept, one more phantom on `Handler`. It makes the real
constraint (a raw-body write is HTTP-dialect and cannot ride RPC) VISIBLE where a
user looks (the `to*` line), before runtime. It also types and validates the
body as a bonus. tRPC keeps only the scopes whose whole input is the payload
(the reads); a future dedicated tRPC write path would deliver the body AS
`input`, a DIFFERENT authoring channel — so the gate stays correct rather than
loosening. `Cap` defaults to `never`, so every param-only/read scope and
every existing `*.test-d.ts` is unaffected (additive).
