---
title: "`bind` is single-arity: the binder is the unit"
area: verb-model
status: accepted
---

# `bind` is single-arity: the binder is the unit

**Decision.** `bind(record)` takes the bare leaves and returns **the
binder** — the record's partial application, a plain function with one
property (the house shape of `Lazy<T>`). Applying it ties FIXED deps
(`bind({ requestOtp })(ctx)`); `.with(window)` ties deps PER CALL
(`bind({ verifyCode }).with(window(db.transaction, bridge))`). The
binder's parameter is the intersection of every leaf's declared deps; the
binder is shaped like a provider, so `.expose(bind({ getAuthor }))` wires
a record point-free, and it is a first-class kit (one record, many
worlds). `within` is renamed **`window`** — the noun the vocabulary
already used; the old name stuttered against `.with` in the inline form.
`bindBy` was initially left unchanged here; [`.by` on the binder](./binder-derivation-key-not-leaf-argument.md) then absorbed it
into the binder as `.by`.

**Alternatives.**
- (a) A curried 1-arity overload NEXT TO the two-arity forms: rejected by
  the **arity theorem** — while the naked verb has both the curried
  (1-arity) and the immediate (2-arity) form, "forgot the second
  argument" stays type-valid in an irreducible case (a deps bag whose
  values are all functions, or a bound record whose leaves take object
  first arguments), surfacing late with a misdirected message. That
  contradicts principle 1.
- (b) The curried form behind a dot (`bind.later(record)`), two-arity
  forms untouched: safe, zero breakage, but taxes the hot path with the
  longer name.
- (c) Naked curried + naked immediate, window moved to a dot
  (`bind.with(window, record)`): the best ergonomics, but keeps the arity
  hole of (a) — rejected on principle 1.
- (d) A separate helper (`leaves`/`bound`/`wired`, proved userland-viable
  in a prototype): a new verb to teach what `bind` already
  means.
- Naming: `.with` kept for the per-call property (Python's `with`
  statement, Effect's `with*` combinators, the HOF `withX` convention; the
  JS "copy-with-changes" `.with` lives on instances, not verbs). The
  stutter was `within`'s fault, so the HELPER was renamed, not the
  property; `bind.per` / `bind.via` were the runners-up. `window` shadows
  the DOM global — accepted: composition roots are server code.

**Why.** One arity, one meaning, NO dispatch — the terminal point of the
until-now implicit principle "dispatch by KIND of the first argument,
never by arity or shape" (PropertyKey vs function vs chain vs plain
object everywhere else in the API; a record and a deps bag are the same
kind, so no naked two-form spelling can be made safe). And the
binder-as-provider click: bind's deferred form and the verbs' patch form
compose with zero new concepts, which is what lets a fluent module read
as one statement per wiring step. The migration was paid pre-publication
(no external consumers; [packaging and naming](./packaging-naming.md)).

**Consequences.**
- The dot marks the CADENCE: an applied binder is the value cadence
  (sync passthrough); `.with` and `bindBy` are per-invocation (always
  `Promise`, fresh window per call). Grepping `.with(` approximates the
  map of the codebase's transactional boundaries.
- Requirement errors carry AGGREGATE blame: the missing keys are named at
  the application, but not which leaf wants them (the old two-arity form
  blamed the entry). Accepted trade.
- Forgetting to APPLY the binder is kind-visible (spreading a binder
  contributes no leaves, so the Pub never lies) but surfaces where the
  record is demanded, not at the spread.
- The window-Deps inference crutch (the intersection giving TS a second
  source) is no longer needed: `.with`'s parameter is fully determined by
  the record, so inline bridges get contextual typing.
