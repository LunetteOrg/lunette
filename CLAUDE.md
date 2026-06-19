# lunette / lntt — guide for resuming work

Dependency injection as a typed chain of layers: Effect's benefits
(type-driven composition, lifecycle, visibility) with plain functions and
objects — no monads, no decorators, no reflection. It is the philosophy of
the `errore` library (errors as values) applied to DI.

## Layout

```
.                       THIS monorepo (npm org: lntt) — the product
  packages/wire         @lntt/wire   the core (runtime + type tests)
  packages/http         @lntt/http   http dialects ("." agnostic, "./hono", "./express")
  packages/{cli,listener,flow}       "planned" scaffolds, design to be discussed
  research/             live research prototypes (prior art, not products)
../playground/          the original design lab (in Italian) —
                        DESTINED FOR DELETION (TODO story 13): its value has
                        already been brought inside; never cite it in packages
../starter/             reference project (React Router 7 + Drizzle)
(private app repo,      the real production bootstrap to rewrite with
 owner's machine)        @lntt/wire (the proving ground; not in this repo)
```

## Design principles (non-negotiable without a discussion)

1. **The type contract**: the engine is guaranteed by tests, the types
   guarantee the user's world — every configuration error surfaces
   IMMEDIATELY, at the call site, at compile time (duplicate keys named,
   unsatisfied requirements, branded leaves outside their window).
   The `*.test-d.ts` files are the proof of that contract: if a refactor
   breaks them, the refactor is wrong even if the runtime tests pass.
2. **Visibility lives in the verb**: `use`/`provide` are private, `expose`
   is public. The chain tracks `Lunette<Ctx, Pub, Seed>`; run/build
   deliver ONLY Pub (type AND runtime). Requirement (Ctx) and visibility
   (Pub) are independent axes.
3. **The error convention is the pivot of everything**: a RETURNED error =
   domain (passes through: commit, no retry, ack); a THROWN error =
   infrastructure (reacts: rollback, retry, nack).
4. **Leaves and windows**: use cases are flat leaves `(deps, ...args) =>
   error | result`. Compose the BARE ones, decorate the EXPOSED ones
   (bind). The window (`With`) is PER CALL, never shared; atomicity = one
   named window (a composed leaf).
5. **One way to do each thing**: new API only with a real case in hand
   (YAGNI). Prefer conventions over features: namespace = the patch's
   shape, alias = a provide, mocking = the seed.
6. **Extensions = dialects via `pipe`**, never verbs grafted into the core
   (inference costs weighed and rejected). A dialect owns its verbs'
   signatures and behaviour.
7. **No ambient magic**: no AsyncLocalStorage for transactions, no
   implicit joins, no transparent proxies. Explicit > convenient.

## Operating conventions

- **Language**: the `lunette/` monorepo is ALL English (code, comments,
  test names, runtime error messages, READMEs) and must contain no
  references to the playground or to the design's history. Conversation
  with the owner stays in Italian.
- **Vocabulary**: chain · layer · bare/bound leaf · window · opener
  (within arg 1) · bridge (within arg 2) · bag · guard · seed · fragment ·
  dialect.
- **Tests**: vitest with typecheck (`*.test-d.ts` included via the
  `typecheck` block in each `vitest.config.ts`; `pnpm typecheck` runs
  `tsc --noEmit` and is the separate gate). Always verify by running:
  `pnpm test` and `pnpm typecheck` (monorepo root: `pnpm -r ...`). Never
  declare green without having run. To scope down:
  - one package: `pnpm --filter @lntt/wire test` / `... typecheck`
  - one file: `pnpm --filter @lntt/wire exec vitest run src/with.test.ts`
  - one case: append `-t "name fragment"` to the file command
- **No build step** for now: `exports` point at the `.ts` sources (the
  build/dist decision is deferred to npm publication).
- **Workflow with the owner**: discuss the design FIRST (he enjoys
  sparring and wants to understand deeply), implement ONLY on an explicit
  go. Present alternatives as choices, never decide silently. API renames
  and additions are proposed in chat before touching files.

## Status and next steps

Open work lives in **`TODO.md`** (monorepo root), written as stories with
the full reasoning — start there. At the top: rewriting the real
bootstrap (the proving ground for everything). Extended pattern
documentation lives in **`docs/`**.

The decision record (discarded alternatives and why) is
**`docs/decisions.md`** — consult it BEFORE proposing API changes: many
ideas already have a reasoned verdict. The persistent memory remains the
backup of the history.
