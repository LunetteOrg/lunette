# lunette / lntt — guide for resuming work

Dependency injection as a typed chain of layers: Effect's benefits
(type-driven composition, lifecycle, visibility) with plain functions and
objects — no monads, no decorators, no reflection. It is the philosophy of
the `errore` library (errors as values) applied to DI.

## Layout

```
.                       THIS monorepo (npm org: lntt) — the product
  packages/wire         @lntt/wire   the core (runtime + type tests)
  packages/scope        @lntt/scope  the host-agnostic scope runtime — ONE
                        primitive (a step wrapping the rest of the fold) and a
                        scope IS the function that runs it, from the first line.
                        The core is ONE file, `index.ts` — where `export`
                        means public, since there is nowhere else for a name to
                        live. On it ship four carriers with their host mounts
                        (express, hono, trpc, react-router) as one subpath each,
                        the guard extension as another, and the read steps
                        re-exported from the host subpath that populates them. The contract is
                        packages/scope/README.md — READ IT FIRST — and the traps
                        a rewrite must inherit rather than rediscover are stated
                        at the line each one constrains, in the source
  packages/{cli,listener,flow}       scaffolds only — no shipped design;
                        their stories live in the tracker
  research/             live research prototypes (prior art, not products) —
                        PoC code proving out behaviour and DX, OUT OF SCOPE for
                        code review (correctness/security/style); only whether
                        it demonstrates its point matters. `terminal-step` and
                        `parameterised-builder` are the two the scope builder
                        was settled on, each carrying its measurement
```

**`@lntt/integration` is SET ASIDE**, deliberately, while the umbrella work
on the scope runtime (#30) is open. It lives on `origin/story-30/scope-impl`
— 27 files, verified present — along with most of the extensions. Porting it against a surface still in motion
is the work done twice; its last state on THIS branch is in the history, one
`git show` away.

**`examples/` are BACK**, landing one slice at a time under #59: `two-chains`,
then the shared `app` and its four per-host entries (`express`, `hono`, `trpc`,
`rr7`), each its own package mounting the SAME chain. They are reviewed as
DEMONSTRATIONS — the convention is at the end of this file. Still to return:
`examples/cloudflare-workers/{bare,express,hono}` (only their
`worker-configuration.d.ts` is here today). `examples/bare-express` does not
come back at all — decision 50.

The old `@lntt/http` (the `pipe`-based "wire owns the server" posture) was
superseded by the scope runtime and removed; if the own-the-loop posture is
ever needed it is rebuilt fresh on the scope core, not resurrected. Nothing is
published to npm yet.

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
- **CODE COMMENTS CITE NOTHING EXTERNAL.** No `§N`, no `decision N`, no
  `#N`, no PR or discussion numbers, in any `.ts` file — comments, test
  names and runtime strings alike. A comment has to stand on its own where
  it is read: a reader with the file open cannot follow a pointer, and a
  pointer decays the moment the thing it names is renumbered, superseded or
  rewritten. So state the CONSTRAINT and the reason for it inline, however
  compressed — "measured", "the gate would collapse to `never`", "a binding
  is a dependency" — and if the reason is too long to inline, the comment
  needs the short version, not a reference.
- **A COMMENT DESCRIBES THE CODE, never the change that produced it.** No
  "used to", no "no longer", no "is gone now", no "this is the shape X made
  impossible", no naming of what was removed, renamed or fixed. A reader
  arrives at the file as it is; the previous version is not in front of them
  and is not their problem. This is strictest in `examples/`, where the
  reader is learning the shape and every sentence about a past API is one
  they have to discard. What SURVIVES this rule is a counterfactual that
  still constrains the reader — "a generic here is not inferred and adds
  nothing, silently", "returning it renders normally where throwing reaches
  the ErrorBoundary" — because that tells them what not to write. The test
  is whether the sentence would still be worth reading if the old version
  had never existed.
- **Where citations DO belong**: `docs/decisions.md` (entries cite each
  other as `decision N` in prose or `§N` compact), the other files under
  `docs/`, READMEs, commit messages, PR descriptions and issues. There a
  reader can follow the link, and the numbering is the document's own.
  NEVER `#N` or `ADR #N` for a decision even there: on GitHub `#N`
  autolinks to issue/PR N — a decision citation would point at an
  unrelated thread. `#N` is reserved for actual issues, PRs and
  discussions.
- **Vocabulary**: chain · layer · bare/bound leaf · binder (`bind(record)`,
  apply = fixed deps, `.with` = per call, `.by` = per call keyed) · window
  · opener (window arg 1) · bridge (window arg 2) · bag · guard · seed —
  and, for the scope runtime, a lexicon of its own: scope (`scope()`
  agnostic, `scope(carrier)` chooses one) · scope execution (one run) · scope
  execution parameters (the second argument — what belongs to THIS run;
  carried as `State['args']` and declared by a carrier's `__args`. NOT
  `seed`, which is wire's build-once, the other lifetime, and not `params`,
  which is the name of an entry a carrier puts INSIDE them) · carrier (chosen
  once, pure declaration — no runtime value — never a step) · extension (two
  things, added by different verbs: a STEP that populates a ctx entry, added
  with `.step`, and a value contributing VERBS, added with `.extend`) · step
  (the primitive — distinct from wire's LAYER, a different mechanism) · verb
  (a method an extension contributes to the BUILDER) · leaf (the innermost
  step, the one that does not call `next`) · entry (a ctx key a validation
  verb may name: either arrives in the execution parameters or is populated
  by a step) · enrichment (what a guard returns) · `Passed` (what `next`
  hands back: an opaque marker for "the rest of the fold answered, whatever
  it said". A step that only observes passes it on; one that DECORATES
  asserts what it expects) · gate (a conditional intersected onto an
  ARGUMENT, so the error lands on the line that contains the mistake) ·
  dialect.

  What a step needs of the transport is NOT a declared name: it is the ctx it
  ANNOTATES, refused by contravariance where the scope does not hold it. There
  is no vocabulary, no intent, no capability and no outcome — a scope hands
  back what its leaf RETURNED, in its host's own shape (decisions 42 and 43).
- **Tests**: vitest with typecheck (`*.test-d.ts` included via the
  `typecheck` block in each `vitest.config.ts`; `pnpm typecheck` runs
  `tsc --noEmit` and is the separate gate). Always verify by running:
  `pnpm test` and `pnpm typecheck` (monorepo root: `pnpm -r ...`). Never
  declare green without having run. To scope down:
  - one package: `pnpm --filter @lntt/wire test` / `... typecheck`
  - one file: `pnpm --filter @lntt/wire exec vitest run src/with.test.ts`
  - one case: append `-t "name fragment"` to the file command
- **A MOUNT IS TESTED WHERE A STEP FAILS**, not only where it succeeds.
  A mount is the one place the library hands control to a framework, and
  the ways it goes wrong there are RUNTIME ways the type contract cannot
  reach: a promise dropped, a `next` never called, a response never sent,
  an error arriving after the answer already left. A suite of happy-path
  mount tests plus `*.test-d.ts` claims sees none of them. So for each
  mount, run at least: a step that THROWS, a step that stops by RETURNING,
  and a step that acts AFTER `next`. Write those before the mount, not
  after the review.
- **Build**: `@lntt/wire` and `@lntt/scope` emit ESM + declarations
  (`pnpm build`); `exports` resolve there, and the commented sources ship
  beside the build. Inside this workspace `@lntt/*` is imported BY NAME and
  the `@lntt/source` condition — `tsconfig.base.json` and `vitest.shared.ts`,
  one place each — resolves it to the SOURCES, so no build stands between an
  edit and its answer. `pnpm verify` is the other gate: it builds, then re-runs
  the type contract and every suite resolved as a CONSUMER resolves them, into
  `dist`, and lists the tarball. TypeScript (pnpm `catalog:`) and Node are one
  version each, the most recent, and CI runs exactly those.
- **Workflow with the owner**: discuss the design FIRST (he enjoys
  sparring and wants to understand deeply), implement ONLY on an explicit
  go. Present alternatives as choices, never decide silently. API renames
  and additions are proposed in chat before touching files.
- **Code review scope**: `research/**` is excluded — it's a PoC proving
  ground, not shipped product. Findings there (bugs, security gaps, style)
  are not actionable; the only thing worth checking is whether the
  prototype demonstrates what it set out to. Scope `/review` and
  `/code-review` to `packages/`, `docs/`, and root config.
- **Reviewing `examples/`**: they ARE reviewed, and by ONE question —
  **does this represent a use case someone really has, on this host?** Not
  whether it is formally correct or production-grade. `examples/CLAUDE.md`
  carries the full lens: what that question refuses (a `<Form>` whose action
  reads JSON; an action guarded by a header a browser cannot send), what is
  explicitly NOT a defect (weak auth, an in-memory repo, no pagination, no
  retry — these are PoCs and their weakness must not be "fixed"), and what IS
  one (a claim in prose that is not true, a shape that would not work,
  divergence between entries with no reason). Read it before touching that
  directory.

## Status and next steps

Open work lives in **GitHub issues** (label `roadmap`), each story
carrying its full reasoning — priorities, status and the lead item live
THERE, never in this file. Start from
<https://github.com/LunetteOrg/lunette/issues>. Extended pattern
documentation lives in **`docs/`**.

Order and status live in the **project**
(<https://github.com/orgs/LunetteOrg/projects/1>), never in a file: a
file lives on a branch, so a written-down order is right only for whoever
stands on the branch that last edited it. Sequence is carried by the
issues' own `blocked by` relations — a claim on the issue, the same from
every branch — and the project's `Priority` field says which of the ready
ones comes first.

The decision record (discarded alternatives and why) is
**`docs/decisions.md`** — consult it BEFORE proposing API changes: many
ideas already have a reasoned verdict. The persistent memory remains the
backup of the history.
