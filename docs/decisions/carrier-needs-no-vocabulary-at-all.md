---
title: "A carrier needs no vocabulary at all; a carrier is `__args` alone"
area: scope-runtime
status: accepted
---

# A carrier needs no vocabulary at all; a carrier is `__args` alone

**Decision.** Removed from the core (`db0ff65`): `Word`, `UnknownIntent`,
`IntentKeysOf`, `IntentsOf`, the word-checking half of `ReturnGate`,
`State['vocabulary']`, `Carrier.__vocabulary`, `VocabularyOf`. A `Carrier` is
now exactly:

```ts
export interface Carrier {
  readonly __args?: object
}
```

— the shape of a run's second argument, and nothing coined. The [carrier-owned vocabulary](./carrier-owns-vocabulary-out-core-coins.md) built a whole
axis (a carrier's words, checked twice — at the definition and at the mount) on
the premise that a step needs a shared name to say a refusal WITH. #76 tested
that premise directly rather than arguing it further, and found it false.

**What was measured.** `research/no-scope-hosts` first wrote the same three
routes (a domain "not found", auth + a redirect after a write, hand-rolled
validation) on Hono, Express, tRPC and React Router with no scope at all,
finding real duplication (four independent `{ notFound: true }` translations)
and a real silent failure (React Router's `return data(null, { status: 404 })`
renders normally instead of reaching an `ErrorBoundary`). `research/with-scope-
hosts` then composed the SAME routes with `@lntt/scope`'s `.step()` on all four
hosts, with a carrier that is `__args` alone:

- The duplication is answered by composition itself, not by a shared word: each
  host's terminal step writes its own native response
  (`c.notFound()`/`throw HTTPException` on Hono, `res.status(...).json(...)` on
  Express, `throw TRPCError` on tRPC, `throw data(...)` on React Router), and
  nothing is repeated ACROSS routes on the same host.
- The React Router silent failure is **not** fixed by scope, with or without a
  vocabulary — no word ever stopped an author from writing `return` instead of
  `throw`, because the mistake is at the call site, not at a missing check. The
  vocabulary is not disproven for this case; it was never load-bearing here.
- Validation (#41's per-carrier word) generalises further than a word: one
  factory, parameterised by schema, produces a step that writes the host's own
  native shape — no carrier vocabulary is read or checked anywhere in the four
  implementations, and none was missed.
- tRPC's guard and "not found" still throw — its one door, unchanged from what
  [the carrier-owned vocabulary](./carrier-owns-vocabulary-out-core-coins.md) itself found — but that is a fact about tRPC's transport, not about a
  vocabulary axis every carrier needs.

**Why.** The two failures of [the carrier-owned vocabulary](./carrier-owns-vocabulary-out-core-coins.md) (a scope saying a word its carrier does not coin; a
host unable to render a word a scope says) were real, but they were failures OF
the vocabulary mechanism, not failures a vocabulary was needed to prevent. With
no words, there is nothing to say incorrectly and nothing to fail to render —
the category of mistake is gone, not guarded against. What actually carried the
weight in every host, vocabulary or not, was the step primitive and `Ctx`'s
contravariant narrowing (a step reading what the scope has not got is refused
at the argument) — exactly the mechanism the vocabulary kept "either way".

**What this retires.** #61 (outbound envelope as carrier vocabulary), #66 (a
translating step from domain errors to carrier words) — both closed, WONTFIX,
their reasoning superseded here. #64's "one factory, each carrier's own word"
survives as "one factory, each carrier's own native shape" and is generalised
further: the factory is parameterised by WHICH entry it validates (body,
header, query, an RPC input), not only by schema, so the same mechanism that
validates a body validates a header. #67's agnostic guard survives with its
premise narrowed: the part of a guard that DERIVES (read a header, decide there
is an actor) is shareable across hosts; the part that STOPS is not, because how
a host ends a request differs by transport, not by vocabulary.

**What this makes obsolete in `@lntt/integration`.** With no vocabulary to
render, and a carrier that ships its own mount helper (`{ route, mw }`,
`{ procedure }`, `{ loader, action }` — `research/with-scope-hosts/src/*/
carrier.ts`), the separate adapter package #58 tracked has nothing left to be:
the carrier subpath IS the adapter. The [mount signature's type parameters](./mount-signature-type-parameters-stay-parameter.md)
(`Handler<Need, S, R, Cap>`, four to seven type parameters per mount) belonged
to that dissolved package.

**Alternatives.** None re-litigated — this is a measurement overturning a
premise, not a new design choice among several. The alternative to "no
vocabulary" was always "keep [the vocabulary a carrier owns](./carrier-owns-vocabulary-out-core-coins.md)", and it is the one just tested
against real code on four hosts and found to buy nothing beyond what
composition alone already provides.

**Deferred.** Promoting `validated`/similar step-factories to `.extend()` verbs,
so what a step populates is named at the call site rather than inferred from a
lambda's body (#64, #69 for the verb-name-collision question it raises). The
guard-fragment shape from #67 (shared derivation, per-host arrest). Neither is
part of this decision — both are the next slice, on the settled premise that
there is no vocabulary to design either one against.
