---
title: "The outcome leaves the core: a scope hands back what its leaf returned"
area: scope-runtime
status: accepted
---

# The outcome leaves the core: a scope hands back what its leaf returned

**Decision.** The core stops producing an outcome. No `ok`/`abort` branch, no
`Outcome` type, no brand, no normalising pass on the way out — a step returns
something and the fold hands it back untouched. What the core keeps is the
intent axis: a word is a SHAPE that declares an intent name, and both gates read
those names off return types — the supply side at `.step` (does this carrier
coin the word?) and the demand side at the mount (can this host render them
all?). The direction is settled here; the implementation and the docs follow,
and what is still open is named at the end.

**Alternatives**, all four built and measured side by side in
[`research/collapsed-outcome/`](../../research/collapsed-outcome/), whose four
kernels share a byte-identical builder so a difference between them is one this
question caused. (a) Keep the two branches — the status quo of [validation belonging to the carrier](./validation-belongs-carrier-outcome-has-two.md). (b) Collapse
to one word, with `R` carrying the word's PAYLOAD. (c) Collapse to one word,
with `R` carrying the WORD.

**Why.** Four strands, and the first two are why the branch was never load-
bearing.

`abort` does not buy what it looks like it buys. It does not stop the fold —
not calling `next` does, which is the definition of a leaf. It does not drive
commit/retry/ack — returned-versus-thrown does ([the returned/thrown convention](./errors-returned-domain-thrown-infrastructure.md)), and an abort
is RETURNED like everything else. What was left was one boolean.

And that boolean is an opinion the core has no title to. It is the argument [the carrier-owned vocabulary](./carrier-owns-vocabulary-out-core-coins.md) made,
turned on the core itself: a core that does not know what a 404 IS cannot know
that a 404 is not ok. Worse, it was never the universal answer it looked like —
on an agnostic `scope()` there are no words, so every step returns a value and
`out.ok` is a constant `true`, carrying no information at all. It means
something only where a carrier defined what a refusal is, which is exactly where
the carrier is present to answer. A scope is a COMPOSER, not an error handler:
if a leaf reports errors as values, or a guard throws, or a carrier ships its
own envelope, none of that is the core's business, and the core had been
pretending otherwise.

Measured, the intermediate options are the worst of both. Collapsing the two
branches into one word saves ~2 instantiations per scope — noise — and in
exchange `ResultOf` stops being the domain type: with one branch a refusal has
nowhere to go but the value channel, so asking "what does this scope produce"
returns the domain type PLUS every refusal payload, for every consumer, the
mount included. Transparency is where the saving is: −36 instantiations per
scope, nine runtime values down to one (and that one is `(r) => r`), 57 lines of
outcome machinery down to 15, and ONE projection where the branded designs need
two.

Both gates survive, which was the finding that could have ended it the other
way. The demand side is the reason the intent axis exists — a host that cannot
render a word must fail to compile, naming it — and it behaves identically in a
transparent core, because it reads intent NAMES and never the branch or the
brand. Verified with a mount whose gate rides the scope argument: a host
rendering fewer words is refused, one rendering more still mounts (the set is a
supply), and a scope that says nothing mounts anywhere.

**What it costs**, and where the cost lands. The WRAP shape pays: `next` is
typed as an opaque `Passed`, so a step that DECORATES what comes back must go
through its carrier to read it. A wrap that only observes is unchanged. This is
the right home for it — whoever coined the words is whoever reads them, and
aligning a result to a host turns out to need no new mechanism, because such an
extension IS an ordinary wrapping step.

**No runtime defence on the way OUT**, and the asymmetry with `Ctx` is
structural rather than an omission. The fold builds the ctx, so it knows its
type and can hand it out read-only. What comes BACK it cannot know: when a step
is written the steps it wraps do not exist yet, so the value it receives from
`next` has no type the core could defend. Freezing or copying it was weighed and
refused — what comes back is usually the app's own object, alive for the life of
the process, so a copy is either shallow, and defends nothing, or deep, and
clones what does not clone (a stream handle, an abort signal, a request). So the
guarantee moves to the one place where the type IS known, the carrier's single
assertion, and the hazard is STATED beside `Passed` rather than removed: a step
that decorates what came back is writing through the app's own object, and
knowing that is the defence.

`Passed` is the one abstraction that survives, and it is a deliberate
understatement: the fold really does hand back the inner answer, and the type
declines to say what it is. It has to. When step 2 is written the builder cannot
know what step 5 returns — step 5 does not exist yet — so `next`'s return type
must stand for "the rest of the fold's answer, whatever it is". Typed `unknown`
it would poison the accumulated union (`unknown | X` is `unknown`) and the scope
would declare nothing. The branded designs got this for free, because
`Outcome<unknown>` was already a distinct type; transparency has to name it.

**Three things were checked and are NOT reasons for this**, recorded so they are
not re-proposed as such.

Seeing every type a scope can hand back does not need the collapse. It is
`Exclude<S['returns'], Passed>` — one exported alias, available in every one of
the four designs, because the state has always accumulated the raw union and
only the projections stripped it. Measured on the shipping core before any of
this was built. And on that axis today's design is the LOSSY one: `Abort<I>`
carries only the intent NAME, so two refusals sharing a name merge into a single
constituent, where a design carrying the value type keeps them apart.

(b) versus (c) is not a safety class. Because `ResultOf` is polluted either way,
(b) also refuses the shortcut whenever the refusal's payload type differs from
the domain type — the union is heterogeneous and that is enough. The two differ
by what the CARRIER must promise: (b) is safe as long as refusal payloads never
coincide with the domain types its users return, which a carrier secures by
giving refusals a recognisable shape — that is, by building the wrapper (c)
provides structurally, once per carrier.

And (b)'s unpredicted flaw is instructive rather than decisive: a refusal
carrying NOTHING (a redirect, a nack) unwraps to `undefined` and makes `R`
nullable. The fix — sending a valueless word to `never` — is exactly the rule
the `abort` branch WAS. An option that has to re-grow half of what it removed
was not the simplification it claimed.

**The one cost, priced.** How much of a real carrier is decorating wraps was
deferred as unmeasurable without a carrier in hand, so the research grew one of
realistic size. A third of its steps decorate — and the cost does not scale with
them. It is ONE assertion, in one helper the carrier writes once; every
decorator beyond that is a one-liner against the carrier's own type, with no
check and no cast, and the carrier never names `Passed` at all (`noUnusedLocals`
refused the import, which is the proof).

Building it also found a constraint the kernels had not shown: steps unwind
innermost-first, so a decorator placed before the leaf is handed a raw domain
value with nothing to attach a header to. A separate `normalise()` step would
fix that only if whoever composes the scope placed it exactly right. So the
helper normalises as well as asserting, every decorator is handed a word
wherever it sits, and the normalising step disappears — which is a better
answer than the one that prompted the question.

**Deferred.** What `Passed` is finally called,
and what a wrapping step is shown of it. And rewriting [the returned/thrown
convention](./errors-returned-domain-thrown-infrastructure.md) in the docs without leaning on `ok`/`abort`, which currently carry
the explanation — the convention itself is unchanged and orthogonal, only its
wording depends on a shape that is going away.
