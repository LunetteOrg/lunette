---
title: "Numeric keys are rejected at the type level"
area: verb-model
status: accepted
---

# Numeric keys are rejected at the type level

**Decision.** Context keys are strings (they name) or symbols (they give
identity — [symbol keys supported, strings recommended](./symbol-keys-supported-strings-recommended.md)). Numbers are rejected by the collision guard at
first use, keyed and patch form alike, with a message naming the key:
`⛔ numeric key not supported (it becomes a string at runtime): 42`.

**Why.** The runtime has no numeric keys — `{ 42: x }` owns the string
key `"42"` — while the type system keeps `42` and `"42"` distinct. Any
PropertyKey-wide guard is therefore structurally blind to the cross
collision: `.provide('42', …).provide(() => ({ 42: … }))` type-checked
GREEN and threw at boot (reproduced during the PR #26 review sparring).
A green program that throws violates principle 1, and no diagnostic
wording can fix a key kind whose identity itself lies. Bonus: an array
passed as a patch (`provide(() => [1, 2])` — always a mistake) falls
under the same ban via its numeric index.

**Alternatives.** (a) Keep numbers and normalize the clash check by
stringifying keys (`${42}` ≡ `'42'`): extra machinery on the hottest
inference path, a symbol carve-out on top, all to legalize `ctx[42]` —
a key no real bootstrap writes. (b) Keep numbers and document the hole:
rejected, the red test existed before the rule did. On the SYMBOL side
of the same review finding: symbols stay supported per [symbol keys supported, strings recommended](./symbol-keys-supported-strings-recommended.md) —
their collisions are rare *by construction* (identity: only reuse of the
same symbol collides, which the guard catches). The message labels them
`(symbol key)` since no `${symbol}` exists at the type level; tsc names
the binding (`typeof theSym`) in the same diagnostic, and the payload
alternative (carrying the symbol in the brand value) was killed by the
oracle — it prints an anonymous `unique symbol`.

**Composite case.** A patch carrying BOTH a numeric key and a genuine
collision on another key reports the two messages as a **union** in one
diagnostic — consistent with how multiple string collisions already
report. (The first cut short-circuited on the numeric ban and silently
dropped the collision; caught in review, fixed to the union.)

**Residual.** A numeric key can still enter through a declared Seed
(`lunette<{ 42: X }>()`) or a cast; the runtime clash net catches those,
and `override` refuses to re-type such a slot (same message) rather than
legalize it after the fact.

**Union keys.** A union key (`'db' | 'mailer'` — from config, a branch)
is judged as a SET: one bad member is a verdict, named exactly (the
clean member never widens the message). The guard's conditional is
tuple-wrapped precisely so the union does not distribute — a naked
conditional let the clean member collapse the whole verdict to `unknown`
and the guard silently vanished (PR #26 review). A union
with no bad member flows, with a pinned residual: the context gains
every member (`Record` over a union) while the runtime sets exactly one
— worth its own decision if a real case ever hits it.
