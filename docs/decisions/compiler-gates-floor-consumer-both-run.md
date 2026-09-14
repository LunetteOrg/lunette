---
title: "One compiler for the gates, one floor for the consumer, and both are run"
area: publication
status: accepted
---

# One compiler for the gates, one floor for the consumer, and both are run

**Decision.** The gates run on TypeScript — the latest release, pinned by a pnpm
`catalog:`, so no package pins its own copy and every file in the workspace is
checked by the one the gate runs — and on Node `>= 24`, the current LTS. That is
what CI runs, on one version per axis: no matrix, no support window.

What a CONSUMER sees is a separate number and a lower one. `engines.node` is
`>= 24`; `peerDependencies.typescript` is `>= 5.9`, the oldest compiler that
reads the emitted declarations. Both floors are RUN: the pinned compiler over
the workspace, the floor compiler over the PUBLISHED declarations — every
subpath of both packages, `skipLibCheck` off — in `verify:tarball`, where it is
installed under an alias so the pinned one keeps the bare name. A floor nothing
compiles is a claim nobody checked, and `peerDependencies` is read as
"required", not as "verified": a floor above what the declarations need turns
every consumer on an older compiler away from something that works for them.

Resolving the SOURCES through the `@lntt/source` condition asks more of a
compiler than reading the declarations does. The sources are checked on the
pinned one alone, and each README says so where it documents the condition.

Neither range is capped. A floor is a promise and is verified; an open top is an
invitation, and a break on a compiler or a runtime newer than these is a bug
report. Raising either floor is a MAJOR, with no case-by-case judgement.

Consequences that follow from [the build shipping the sources beside it](./build-ships-sources-ship-beside-condition.md) rather than from taste: the packages
are ESM-only, and `rewriteRelativeImportExtensions` is what lets the sources
keep their explicit `.ts` import extensions while the emitted JavaScript carries
`.js`.

**Alternatives.** *A range wider than anything run* — `>= 22` on Node, several
TS majors, none of them exercised. Rejected on the rule that makes the rest
cheap: we declare only what is verified, or a floor is a claim nobody checked.
*The consumer's floor at the pinned compiler* — `>= 7` in `peerDependencies`
too, one number for both roles. Simpler to state, and wrong in the field the
package manager reads: the declarations compile on 5.9, so the only thing that
floor produces is an unmet-peer warning telling a consumer to upgrade for
something that already works. *Staying on TypeScript 5.x* —
measured and unnecessary: 7.0.2 typechecks wire, scope, all six examples and the
research prototypes with zero errors, `@ts-expect-error` directives included
(one that stopped applying would itself be an error), `vitest --typecheck` runs
on it, and its declaration emit carries the same types as 5.9.3's — byte for
byte across wire, and in scope differing only in which quote character a string
literal is printed with.

**Why.** Nothing is published yet, so this is the one moment when raising a
floor costs nobody a major. The compiler tracks the LATEST because it IS the
contract — the gates are conditional types, only as good as the checker reading
them — while the runtime tracks LTS, because a floor above it would refuse
consumers for nothing. The compiler a CONSUMER holds follows the runtime's
reasoning rather than the gate's: it does not read our conditional types, it
reads what they emitted. Supporting three compilers would mean three CI runs
and three ways a gate could behave differently, for consumers who do not exist.
Dedicated builds for older TypeScript or Node can be added if a real case
appears; until then, one number per axis is the whole policy.
