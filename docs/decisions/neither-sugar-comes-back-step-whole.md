---
title: "Neither sugar comes back: `.step` is the whole fold surface"
area: scope-runtime
status: accepted
---

# Neither sugar comes back: `.step` is the whole fold surface

**Decision.** `guard` and `handle` are refused, and #63 closes decided rather
than open. `.step()` stays the only fold verb, with `.extend()` for the builder.

**The primary reason is the owner's, and it is the cheapest one.** `next` is one
parameter and one call. A sugar that removes them buys very little, and the cost
of being wrong in this direction is nothing — a verb can be added later, with the
case that justified it in the commit, which is principle 5 exactly. The cost of
being wrong in the other direction is an API that accumulated a verb nobody
needed and can no longer drop.

**`handle` had already lost its subject.** It was going to hide the TERMINATION
declaration and the NORMALISATION of a leaf's value into an outcome. A step that
does not call `next` ends the fold with nothing to declare, and [the outcome leaving the core](./outcome-leaves-core-scope-hands-back.md) left
nothing to normalise into. Four carriers were ported (#60) and the leaf never needed
anything a step does not have. The one leaf-specific rule that did emerge — what
a leaf may hand back — lives at the MOUNT (`AnswerGate`, [the mount as a gate too](./mount-gate-too-checked-verb-has.md)), where the host
that cannot send it is known; the builder cannot know it and so cannot be where
it goes.

**`guard` is not merely unneeded, it is not expressible.** A guard has to tell an
ENRICHMENT from a STOP at runtime: merge this value into the ctx, or hand it back
as the answer. The vocabulary [a carrier owned](./carrier-owns-vocabulary-out-core-coins.md) made that sayable — a carrier's word said which —
and [a carrier being `__args` alone](./carrier-needs-no-vocabulary-at-all.md) removed it. Without one, `{ actor: 'u1' }` and a `Response`
are both objects, and every scheme that separates them is a brand: the vocabulary
again, under another name, arriving through the sugar door after being turned
away at the front.

The port shows the split is per HOST, which is what makes it a design fact rather
than an inconvenience:

| host | how a guard stops | is `guard` expressible? |
|---|---|---|
| tRPC | `throw new TRPCError(…)` | yes — everything RETURNED is an enrichment |
| React Router | `throw data(…)` / `redirect(…)` | yes, same reason |
| Express | `return res.status(401).json(…)` | no — a returned value is ambiguous |
| Hono | either, and both ship in tests | no, for the returned half |

A sugar available on half the hosts, meaning something different on each half, is
what principle 5 refuses. Note the lexicon entry that has been describing `guard`
as "stop with one of the carrier's words" was stale from [a carrier being `__args` alone](./carrier-needs-no-vocabulary-at-all.md) onward, and is now
corrected here: a guard is a SHAPE a plain step already has — read the ctx,
either continue inward or hand something back — rather than a mechanism of its
own. The next entry gives it a verb anyway, in an extension, for the ergonomics
and not for the mechanism.

**What was NOT weighed, and did not need to be.** #63 said `guard`'s case is a
LEGIBILITY claim, judged on real examples, and named #59 as where it becomes
visible. That question is not answered here and does not need to be: whether
`next` reads as noise is a matter of taste, and taste does not get asked about
something that cannot be built without undoing [a carrier being `__args` alone](./carrier-needs-no-vocabulary-at-all.md). If #59 makes the call site
read badly, the answer is a different sugar, not this one.

**Alternatives.** *Defer `guard` to #59* — the issue's own plan, and it would
have rediscovered the brand problem later, after the examples were written
against a verb that could not ship. *`guard` on the two hosts where it is
expressible* — named only to refuse it: a form that means different things
depending on where it is used is the one-thing-two-ways this design keeps out.
