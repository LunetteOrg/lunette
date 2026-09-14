---
title: "Validation belongs to the carrier, and the outcome has two branches"
area: scope-runtime
status: accepted
---

# Validation belongs to the carrier, and the outcome has two branches

**PARTLY SUPERSEDED by [a carrier being `__args` alone](./carrier-needs-no-vocabulary-at-all.md).** The "outcome has two branches" half was
already gone by [the outcome leaving the core](./outcome-leaves-core-scope-hands-back.md), two decisions later. The "validation
fails in the carrier's own word" half is now gone too: #76 found a validation
step writes its host's native response directly (`c.json({...}, 422)`,
`data({...}, {status:422})`), with no shared word between them needed — the
argument that a word must exist before a rejection can be said no longer holds,
because no word exists and rejection still works. What survives entirely: one
factory, not one implementation per carrier — [a carrier being `__args` alone](./carrier-needs-no-vocabulary-at-all.md) keeps this and
generalises it further (#64).

**Decision.** `@lntt/scope/standard-schema` shipped a CARRIER-FREE `.validate`,
and to give it somewhere to fail the core grew a third outcome branch it owned:
`invalid`, with `Invalid` and `Issue` beside it. Both are removed. `Outcome` is
`ok | abort`, and validation comes back per carrier, each failing in its own
words.

The argument is the one [the carrier-owned vocabulary](./carrier-owns-vocabulary-out-core-coins.md) made, applied to a case it did not live to see. Validating
means being able to say "this is not acceptable"; saying anything means having a
word; a word belongs to a carrier's vocabulary. That entry already wrote the conclusion
— *"a bare `scope()` has neither an input channel nor a way to abort, which is
correct: a scope with no carrier runs nowhere"* — and put the input verb in the
carrier (`.params(schema)` on http, `.input(schema)` on trpc). The carrier-free
`validate` contradicted it, and the `invalid` branch is what made the
contradiction inhabitable. So this is not a reversal of 40. It restores it, and
removes the plumbing that was hiding the breach.

What the branch bought was exhaustiveness: a codec could not forget `invalid`,
because the union made it a compile error. That does not disappear, it moves to
the intent axis — a mount is checked against the words a scope can say, which is
the right home for "can this host render this?". One mechanism instead of two,
and the one that was already there.

What it cost was worse than the plumbing. A 422 on HTTP is not
`UNPROCESSABLE_CONTENT` on tRPC, and a core-owned branch made that difference
something a mount had to reconstruct rather than something a carrier could
state. Per-carrier words let each say it directly.

The step itself does not vary — read the entry, run the schema, replace it or
stop — so this is one factory taking the word, not one implementation per
carrier. The engine never was ours: Standard Schema is a spec, `~standard.
validate` is called on whatever the caller passed, and with the extension gone
`@lntt/scope` has ZERO dependencies, not even types-only.

**Deferred.** Which entries a carrier exposes as validatable, and whether the
verb is named per carrier (`.params` / `.input`) or uniformly, is decided with
the carriers in hand and tracked on its own issue — deliberately not part of the
carrier port, so the port does not smuggle in a surface nobody has used yet.
