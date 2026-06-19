# Contributing — the RFC process

lunette is currently a **Request for Comments**: a worked design seeking
critique before publication. The most valuable contribution right now is
not code — it is a sharp objection, a missing case, or a use case the
design does not yet dissolve.

## Before you propose anything

**Read [`docs/decisions.md`](./docs/decisions.md) first.** It records 25
decisions with the alternatives considered and why each was discarded.
Many ideas already have a reasoned verdict; re-proposing one without
engaging its recorded "why not" is the one move that wastes everyone's
time. `grep Superseded docs/decisions.md` lists every API that was
implemented and later withdrawn.

## How to engage

| You want to… | Use |
|---|---|
| think out loud, ask, say "have you considered…" | [Discussions](https://github.com/LunetteOrg/lunette/discussions) |
| disagree with a specific decision | **Challenge a decision** issue (cite the number) |
| ask for a new/changed API | **Propose an API change** issue (bring the real case) |
| fix a bug, a typo, a test | a pull request |

Design is discussed **first**. A pull request that changes API surface
without a prior discussion or accepted issue will be asked to start from
one — not out of ceremony, but because the design's value is in its
coherence, and coherence is argued, not merged.

## The non-negotiables

These are the load-bearing commitments. A change that breaks one is not a
tweak — it is a different library, and needs to win that argument
explicitly:

1. **The type contract.** Every configuration error surfaces immediately,
   at the call site, at compile time (duplicate keys named, unsatisfied
   requirements, branded leaves outside their window). The `*.test-d.ts`
   files are the executable proof of this contract: **if a refactor breaks
   them, the refactor is wrong even when the runtime tests pass.**
2. **Visibility lives in the verb.** `use`/`provide` private, `expose`
   public; `run`/`build` deliver only the public surface, in type and at
   runtime. Requirement and visibility are independent axes.
3. **The error convention.** Returned error = domain (passes through);
   thrown error = infrastructure (reacts). This is the pivot of every
   boundary mechanism.
4. **Leaves and windows.** Use cases are flat leaves; the window is
   per call, never shared.
5. **One way to do each thing (YAGNI).** New API only with a real case in
   hand. Conventions over features.
6. **Extensions are dialects via `pipe`,** never verbs grafted into the
   core.
7. **No ambient magic.** No AsyncLocalStorage for transactions, no
   implicit joins, no transparent proxies. Explicit over convenient.

## Conventions

- **Language: English** for everything checked in — code, comments, test
  names, runtime error messages, docs.
- **Tests:** vitest with typecheck. Always verify by running `pnpm test`
  and `pnpm typecheck` (workspace root: `pnpm -r ...`); scope down with
  `pnpm --filter @lntt/wire exec vitest run src/with.test.ts`. Never
  declare green without having run.
- **No build step for now:** `exports` point at the `.ts` sources.

## Accepting an outcome into the record

When a discussion or issue resolves into a decision — adopted *or*
rejected — it earns an entry in `docs/decisions.md` in the
**Decision · Alternatives · Why** format. The record is the memory of the
project; an argument that is not written down will be had again.
