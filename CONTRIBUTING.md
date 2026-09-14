# Contributing — the RFC process

lunette is currently a **Request for Comments**: a worked design seeking
critique before publication. The most valuable contribution right now is
not code — it is a sharp objection, a missing case, or a use case the
design does not yet dissolve.

## Before you propose anything

**Read [the decision record](./docs/decisions) first.** Every decision is
one file under `docs/decisions/`, carrying the alternatives considered and
why each was discarded. Many ideas already have a reasoned verdict;
re-proposing one without engaging its recorded "why not" is the one move
that wastes everyone's time. `grep -ril superseded docs/decisions/` lists
every API that was implemented and later withdrawn.

## How to engage

| You want to… | Use |
|---|---|
| think out loud, ask, say "have you considered…" | [Discussions](https://github.com/LunetteOrg/lunette/discussions) |
| disagree with a specific decision | **Challenge a decision** issue (name the entry) |
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
   requirements, branded leaves outside their lease). The `*.test-d.ts`
   files are the executable proof of this contract: **if a refactor breaks
   them, the refactor is wrong even when the runtime tests pass.**
2. **Visibility lives in the verb.** `use`/`provide` private, `expose`
   public; `run`/`build` deliver only the public surface, in type and at
   runtime. Requirement and visibility are independent axes.
3. **The error convention.** Returned error = domain (passes through);
   thrown error = infrastructure (reacts). This is the pivot of every
   boundary mechanism.
4. **Leaves and leases.** Use cases are flat leaves; the lease is
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
  `pnpm --filter @lntt/wire exec vitest run src/lease.test.ts`. Never
  declare green without having run.
- **Lint and format: Biome** (`pnpm lint` to check, `pnpm lint:fix` to write),
  configured in `biome.jsonc` — two spaces, single quotes, no semicolons, 80
  columns. The rules that fight a type-level library are off with their reason
  beside them; `research/` is out of scope. A `lefthook` pre-commit hook runs
  Biome over the staged files and restages what it fixed, and CI runs the same
  check, so the hook is a convenience and never the gate. `pnpm install` sets
  the hooks up, from the MAIN worktree only — the shims carry the absolute path
  of the binary that wrote them, and a linked worktree writes one that
  disappears with it.
- **`@ts-expect-error` marks a LINE**, and the formatter decides which line a
  call ends up on: put the comment immediately above the argument or the call
  the error lands on, not above the head of the chain. A misplaced one fails
  twice — the expected error is unsuppressed, and the suppression is unused.
- **Build and verify:** `@lntt/wire` and `@lntt/scope` emit ESM +
  declarations (`pnpm build`), and `exports` resolve there. Inside this
  workspace `@lntt/*` is imported by NAME and the `@lntt/source` condition
  resolves it to the sources, so no build stands between an edit and its
  answer. `pnpm verify` builds, recompiles the type contract against the
  built declarations, re-runs every suite through `exports` into `dist`, and
  checks the tarballs a consumer would install.
- **One version per axis:** TypeScript (pnpm `catalog:`) is pinned to the latest
  release, Node to the current LTS, and CI runs exactly those. The floor a
  CONSUMER sees is lower and separate — `peerDependencies.typescript` is the
  oldest compiler that reads the emitted declarations, and `verify:tarball` runs
  it over them. Raising either floor is a major.

## Accepting an outcome into the record

When a discussion or issue resolves into a decision — adopted *or*
rejected — it earns a file of its own under `docs/decisions/`, in the
**Decision · Alternatives · Why** format. The record is the memory of the
project; an argument that is not written down will be had again.

**One decision, one file**, named by a slug of its title:
`errors-returned-domain-thrown-infrastructure.md`. It opens with YAML
frontmatter, then an H1 repeating the title:

```yaml
---
title: "Errors: returned = domain, thrown = infrastructure"
area: leaves-errors-leases
status: accepted
---
```

- **`title`** — the decision in one line, the same sentence as the H1.
- **`area`** — where it belongs, one of `core-shape`,
  `keys-visibility-composition`, `extensibility`, `leaves-errors-leases`,
  `resources-lifecycles`, `testing`, `meta-contract`, `verb-model`,
  `scope-runtime`, `publication`.
- **`status`** — `accepted`, or `superseded` once a later decision overturns
  it. A superseded entry stays where it is and gains a note at the top
  saying which decision replaced it and what the old shape cost.

**Entries cite each other by LINK, never by number.** A decision has no
number — its file is its identity — so a citation is a relative link whose
text names the decision and reads as part of the sentence: `under [the
returned/thrown convention](./errors-returned-domain-thrown-infrastructure.md)
a throw means infrastructure`. From elsewhere in the repository the path is
relative too — `../decisions/<slug>.md` from `docs/`, `../docs/decisions/…`
from a sibling directory, `docs/decisions/…` from the root. The exception is a
file that is SHIPPED, where a relative path resolves against a tarball a reader
does not have: a package README uses the full
`https://github.com/LunetteOrg/lunette/blob/main/…` URL. `#N` stays reserved
for issues, PRs and discussions.

There is deliberately **no index file and no immutability ritual**: the
directory listing is the index, and git carries the history of who changed
what and when, so an entry is edited in place rather than frozen.
