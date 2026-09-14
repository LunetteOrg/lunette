---
title: "Extensions supply values; only the app extends the chain"
area: verb-model
status: accepted
---

# Extensions supply values; only the app extends the chain

**Decision.** Nothing extends the chain through a generic parameter. The
three extension shapes each have their lane: a **dialect** consumes the
chain (`run`/`build` behind `pipe`) and owns its own verbs' signatures;
a **package** ships values — an adapter to `provide`, a window builder
for `.with`, a decorator for `bind` (the #27/#28 shapes) — and the app
does the wiring; a reusable bundle of layers is a **fragment**, mounted
on a concrete chain with its requirements declared in the Seed. A helper
generic over the chain (`<Ctx …>(chain: Lunette<Ctx, …>) =>
chain.provide(…)`) is refused by the argument-side collision guard with
`TS2769`, even collision-free — and that refusal is kept as a
**guardrail**, not fixed as a bug.

**Why.** The argument-side guard ([key collisions forbidden on two levels](./key-collisions-forbidden-two-levels.md), discussion #21) asks its
question at the verb's call site. Inside a generic helper that site sees
`Ctx` as a type variable, so the question becomes "is this key free for
EVERY `Ctx`?" — honestly unprovable: some caller's chain may carry the
key. The old return-type guard deferred the answer to each caller; the
argument-side guard cannot, so generic middlemen stopped compiling. The
codebase-wide survey (bootstrap replica, module shapes, the http
dialects) found ZERO such helpers: every real extension already lives in
one of the three lanes, all of which wire on concrete chains where the
guard resolves. The refused pattern duplicates what fragments already do
(principle: one way to do each thing), minus the Seed's honesty about
requirements.

**Alternatives.** (a) Hybrid guard — argument-side for concrete types,
return-side fallback for generic ones: real complexity on the hottest
inference path to protect a redundant pattern; nothing in the tree needs
it. (b) Back to the return-type guard: forfeits the exact-line, named-key
diagnostic at every real wiring site to unblock a pattern no real code
uses. (c) A blessed unchecked verb (`provideUnchecked`): an escape hatch
wide open for exactly the mistakes the guard exists to catch. A dialect
that genuinely must add layers can cast internally — it owns its
signatures (decision on dialects; principle 6) and answers for its own
honesty.

**Pinned.** `collision-guard.test-d.ts` ("generic chain extension is
refused by design") keeps the refusal and its concrete-chain twin green;
`docs/patterns/reading-errors.md` ("The refused wrapper") is the
field-guide entry.
