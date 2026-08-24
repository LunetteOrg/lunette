# lunette / lntt — guide for resuming work

Dependency injection as a typed chain of layers: Effect's benefits
(type-driven composition, lifecycle, visibility) with plain functions and
objects — no monads, no decorators, no reflection. It is the philosophy of
the `errore` library (errors as values) applied to DI.

## Layout

```
.                       THIS monorepo (npm org: lntt) — the product
  packages/wire         @lntt/wire   the core (runtime + type tests)
  packages/scope        @lntt/scope  the host-agnostic scope runtime (scope/
                        guard/leaf, .input, the fold) — framework-free; carrier
                        capabilities ship as tree-shakable subpaths, each mapping
                        to the hosts that support it ("./request" ctx.request, no
                        cap → tRPC too; "./body" .body/.form, cap 'body'; "./cookies"
                        the sink, cap 'cookies') — the core names none
  packages/integration  @lntt/integration  host adapters as tree-shakable
                        subpaths ("./hono", "./express", "./react-router",
                        "./trpc") — wire as a guest, per-host native routing
  packages/{cli,listener,flow}       scaffolds only — no shipped design;
                        their stories live in the tracker
  examples/             example apps USING the shipped packages (IN review
                        scope): examples/app is the broad issue-1 app (its use
                        cases as @lntt/scope scopes); per-host entries mount
                        it via @lntt/integration/*, and examples/node-http
                        mounts it with NO adapter at all (runScope by hand, §33)
  research/             live research prototypes (prior art, not products) —
                        PoC code proving out @lntt/wire's behaviour and DX,
                        OUT OF SCOPE for code review (correctness/security/
                        style); only whether it demonstrates its point matters
```

The old `@lntt/http` (the `pipe`-based "wire owns the server" posture) was
superseded by the scope runtime (`@lntt/scope` + `@lntt/integration`, "wire as
a guest") and removed; if the own-the-loop posture is ever needed it is rebuilt
fresh on the scope core, not resurrected. Nothing is published to npm yet.

Everything outside this monorepo (design history, reference apps, the
production proving ground) lives in its own repo and is referenced from
the tracker when relevant — never from here.

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
  references to external repos or to the design's history. Conversation
  with the owner stays in Italian.
- **Citing decisions**: entries in `docs/decisions.md` are cited as
  `decision N` (prose) or `§N` (compact). NEVER `#N` or `ADR #N`: on
  GitHub, `#N` autolinks to issue/PR N — a decision citation would point
  at an unrelated thread. `#N` is reserved for actual issues, PRs and
  discussions.
- **Vocabulary**: chain · layer · bare/bound leaf · binder (`bind(record)`,
  apply = fixed deps, `.with` = per call, `.by` = per call keyed) · window
  · opener (window arg 1) · bridge (window arg 2) · bag · guard · seed ·
  scope (`scope()` agnostic, `.extend(ext)` injects carriers) · carrier
  (`RequestCarrier`/`JobCarrier`) · scope extension (a composable unit in a
  tree-shakable subpath — `request` read-only, `body`, `cookies` — each declaring
  ctx/methods/deps/capability; the core names none; `.extend` gates collisions,
  §4) · capability (`'body'`/`'cookies'`, gated at mount per host, §34) · dialect.
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
- **Code review scope**: `research/**` is excluded — it's a PoC proving
  ground, not shipped product. Findings there (bugs, security gaps, style)
  are not actionable; the only thing worth checking is whether the
  prototype demonstrates what it set out to. Scope `/review` and
  `/code-review` to `packages/`, `docs/`, and root config.

## Status and next steps

Open work lives in **GitHub issues** (label `roadmap`), each story
carrying its full reasoning — priorities, status and the lead item live
THERE, never in this file. Start from
<https://github.com/LunetteOrg/lunette/issues>. Extended pattern
documentation lives in **`docs/`**.

The decision record (discarded alternatives and why) is
**`docs/decisions.md`** — consult it BEFORE proposing API changes: many
ideas already have a reasoned verdict. The persistent memory remains the
backup of the history.
