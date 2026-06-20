# TODO — open work, written as stories

Each story carries its full reasoning so work can resume cold. Ordered by
expected value. Design-stage stories require a discussion before any code.

---

## 1. Prove the design on a real application bootstrap

**Status:** delivered, pending owner review · **Type:** validation

**Context.** The whole API was designed against a real-world reference: a
React Router 7 + Drizzle app whose composition root wires ~25 use cases by
hand (repos rebuilt inside transactions, memoized infrastructure, feature
flags, cookies). Every piece of wire — chain, visibility, seed, mount,
leaves, windows, testing — was shaped to dissolve that file. Until a
real-shaped bootstrap is rewritten with `@lntt/wire`, the design is
validated only by miniatures.

**Method (decided).** The real file lives in a separate, private
application repo — it cannot be committed, re-run in CI, or benchmarked
here. So the validation artifact is a **faithful anonymized replica**
built inside [`research/`](./research/): a runnable RR7 + Drizzle
composition root that anonymizes *names and domain* but **preserves form
and cardinality** — same layer count, same transactional windows, same
depth, same feature-flag/cookie/memoized-infra stressors. Sanding the
messy parts off would just make a bigger miniature, not a validation. The
external production bootstrap stays the eventual adoption target, not a
committed artifact. The replica doubles as the lead adoption example
(feeds the RR7 adapter, story 15) and the load-test subject (story 11).

**Tasks.**
- Build the replica's manual `createApp` equivalent, then dissolve it into
  a chain: infrastructure as private keyed layers, areas as `expose`d
  modules, use cases as bare leaves with `bind`, transactional commands
  via `within(db.transaction, bridge)`.
- Wire the RR7 server entry through `build()` + `getLoadContext`, with the
  HMR promise-memo recipe.
- Port a meaningful slice of tests to the seed-as-mock-boundary pattern.
- **Measure type-checker time** on the real-size chain (the 20-step
  stress test types in ~0.3s; this replica is the actual benchmark).

**Done when:** the replica boots and serves through wire, route loaders
only see the public surface, tests are green, and checker time is recorded
against the real-size chain.

**Delivered** in [`research/bootstrap-replica/`](./research/bootstrap-replica/)
(see its README). Source mapped: `discentis/pelion/apps/community` (4 areas,
6 repos, 1 disposable, 3 feature-flagged services, 2 signed cookies, ~19
leaves, 1 transaction window). Anonymized to a render/threads/access/profile
domain preserving form and cardinality.

- `createApp` dissolved into one chain (`app/bootstrap/chain.ts`): the disposable
  `db` is the only raw `use` onion; everything else is point-free keyed
  `provide`; `render` is a private mounted fragment whose Pub feeds the
  `threads` fragment's Seed; `access`/`profile`/`threads` are public modules.
- RR7 `build()` + `getLoadContext` with the HMR promise-memo, plus a raw Express
  boundary that serves the same chain over HTTP (host-agnosticism, no dialect).
- Tests green (runtime + `*.test-d.ts`): seed-as-mock-boundary, bare-leaf, and
  the transaction window proven both ways (return → commit, throw → rollback)
  against real Postgres (PGlite).
- **Checker time recorded:** real-size chain `tsc` Check time **0.28s**
  (Total 0.54s, 129,883 instantiations) — on par with the 20-step stress (~0.3s).
- Findings fed back to the design (in the README): `make*` ritual disappears
  (dec. 13); the sugar dominates, raw onion needed once (dec. 26); `layer()` is
  patch-only (no keyed helper — evidence-gated); the error convention dissolves
  the manual rollback dance.

---

## 2. Request scope in the dialects

**Status:** design discussion pending · **Type:** design + feature

**Context.** Deliberately parked from day one. Per-request dependencies
(session, current user, Cloudflare's `waitUntil`) belong to the layer
that *holds the request*: the dialect, not the chain (chain layers run
once at boot). The machinery already exists conceptually: a per-request
window — the same per-call instantiation family as transactions
(`bindBy`, windows) — opened by dialect middleware around each handler.

**The objective — what "request scope" must handle.** Per-request
middleware: (1) observability spanning the request (span before, status
after); (2) Response transforms (headers, compression, envelope);
(3) error-mapping at the boundary (returned domain → 4xx, thrown infra →
5xx — decision 14 meeting HTTP); (4) short-circuit (cache hit, 429, 401:
the handler never runs); (5) commit/rollback gated on the outcome;
(6) `waitUntil`/deferred work after the Response is produced. All share
one shape: **deps DOWN** (session, current user) + **Response UP** +
**0/1/N runs**.

**That shape is the window.** `With<Deps> = <T>(use: (deps) => Promise<T>)
=> Promise<T>` already lends deps down AND returns the result up; 0/1/N is
breaker/normal/retry (decision 15). So a request = a request window opened
around the handler; a middleware = a window opener (lends deps and/or
transforms the return); a stack = nested openers; the handler is the
innermost `use`; the Response is the `T` that rises. Cache/429/401 = "0
times"; commit/rollback = the error convention inside the opener. **The
per-request Response rises in the window's RETURN, not in the core onion's
`next`** — boot layers run once and never see it. On this analysis the
third slot reserved on `Provided` (decisions 3, 26) is unnecessary; keep
it reserved only against a case the window cannot express (the fork below).

**Open fork — is `middleware` a first-class concept, beside `layer`?**
Windows *can* express request middleware, but the ergonomics are poor
(manual opener nesting). Three positions to weigh, cheapest first:
- (a) **Convention only** — request scope is windows; the dialect supplies
  the registration/composition sugar. No new concept; most YAGNI;
  consistent with decision 10 (extensions are dialects).
- (b) **First-class `middleware` in the dialect** — the HTTP dialect names
  a `middleware` (registered as a list, composed by the dialect),
  implemented on top of windows. A clearer mental model (layer = boot,
  middleware = request) without touching the core; still decision-10-shaped.
- (c) **Middleware as a core concept** — wire grows a request-cadence onion
  beside the boot onion, `next` carrying the Response up. The ONLY branch
  that revives `Provided<All, Pub, R>`. Highest power, highest cost; needs a
  case (a)/(b) cannot serve.
The hinge is finding a real middleware that windows cannot express. If none
appears, (a)/(b) win and the third slot is retired; if one does, it is
exactly what justifies (c) and a PoC of the third slot.

**Remaining open questions (decide, not invent).** Handler signature
(extend deps vs a second context argument); how middleware are registered
and composed ergonomically; request-window ↔ transaction-window nesting
order; `waitUntil` integration; teardown timing per request.

**ADR note.** Closing this should split decision #7 of `docs/decisions.md`,
which today files three different cadences under one ambiguous "late
config": boot-time (seed to `run`/`build`), first-request-time (seed via
`worker`, memoized once per isolate — #12), and genuinely per-request
(the dialect window decided here). Closing this writes a new decision
naming the distinction and recording the request-window /
transaction-window composition verdict.

---

## 3. Parallel boot of independent layers

**Status:** deferred until story 1 · **Type:** design + engine

**Context.** The chain walks strictly sequentially; independent layers
(db, email, storage) could boot concurrently — Effect does this. The
blocker is knowledge: parallelization needs the dependency graph, and a
layer currently declares what it **provides** (the keyed form) but not
what it **reads**. Options: declare reads explicitly, or infer them.
Value is low today (boots are milliseconds), so this waits for evidence
from story 1.

**Prior art — do not redesign from scratch:** the order-free prototype in
[`research/order-free-layers/`](./research/order-free-layers/) (kept
alive in this workspace, tests included) already implements runtime
`requires` keys plus topological resolution (layers run when their
requirements are satisfied), including its documented trade-off:
requirements declared twice (runtime key list + type annotation) with
TypeScript unable to enforce consistency between the two. Any
reads-declaration design should start from that experiment and its
limits.

---

## 4. `any` → `unknown` pass in the engine internals

**Status:** ready, low risk · **Type:** refactor

**Context.** The engine's internal `any`s fall in two families:
*existential* ones (the entries array cannot carry each layer's evolving
generics — a TypeScript structural limit; these stay) and *substitutable*
ones that can become `unknown` plus localized casts. The user-facing
contract is unaffected either way: the engine is guaranteed by tests, the
types guarantee the user's world. The `*.test-d.ts` suite is the safety
net for this refactor — if it breaks, the refactor is wrong even with
green runtime tests.

**Guard — do not delete the return channel.** `walk` ends by returning
`doneToken` and the scope result travels by closure side-effect
(`result`), so the `Provided` return path looks like dead code. It is
RESERVED: it is the passage point for a request-time Response rising back
through the onion (ADR #3). The token is now two-axis (`Provided<All,
Pub>`, decision 26 consumed slot 2 for visibility); when the request-time
axis lands, the Response is the **third** slot (`Provided<All, Pub, R>`),
registered as its own decision — not left in comments.

---

## 5. Teardown error aggregation

**Status:** design discussion pending · **Type:** design

**Context.** If a layer's `finally` throws while the scope is already
failing, JavaScript semantics make the teardown error MASK the original
one. The engine cannot intercept this: teardown is user code inside the
layer's own try/finally. Current stance (documented): the convention
"teardown must not throw" (catch inside the finally). To evaluate: at
least for keyed layers, whether the engine can log/aggregate (e.g.
`AggregateError`), or whether documentation is the honest endpoint.

**Sharper than "masked error".** Because the onion is just nested
`await next(...)` (`index.ts:426`, the post-`next` code is user
teardown), a teardown that throws makes the rejection rise through the
outer `await`s — so the teardown blocks of the LAYERS FURTHER OUT never
run. It is a resource leak in cascade, not only a swallowed error. This
is the only point where the design's "every error surfaces at compile
time" promise does not hold (the `Layer` signature cannot distinguish a
safe teardown from a throwing one). Close this story with an explicit
verdict between aggregate-for-keyed-layers and documentation-as-endpoint,
and record it as a decision — "for now" currently has no closing
criterion. (ADR #20.)

---

## 6. Express adapter hardening

**Status:** ready when publishing matters · **Type:** robustness

**Context.** The Express engine/dialect in `@lntt/http/express` is
demo-grade: the body is buffered as text (no streaming, no multipart),
headers cross with loose casts. Fine for tests and prototypes; needs real
work before the package is published for production use. The Hono path is
naturally fetch-based and in better shape.

---

## 7. `@lntt/cli` — command-line dialect

**Status:** design discussion pending · **Type:** new package

**Context.** A CLI invocation is exactly one `run` scope: boot → command →
teardown. Commands are bare leaves over the public surface. `lazy()`
matters here more than anywhere: `--help` must not open a database pool.
To design: argument parsing ownership, command registration shape,
exit-code mapping from the error convention (returned domain error vs
thrown infrastructure error).

---

## 8. `@lntt/listener` — event consumers over external buses

**Status:** design discussion pending · **Type:** new package

**Context.** A listening app on an external bus (Redis, BullMQ, SQS) is a
separate chain whose handlers are bare leaves `(deps, event)`, each
message processed in a per-call window. The error convention maps directly
onto delivery semantics: returned domain error → ack (dead-letter with a
reason), thrown infrastructure error → nack (redelivery). Engines should
be swappable like the http ones. Companion piece: the transactional
outbox is just a bridge on the emitting side
(`within(db.transaction, (tx) => ({ db: tx, events: outboxEmitter(tx) }))`).

---

## 9. `@lntt/flow` — orchestration on top of events

**Status:** design discussion pending · **Type:** new package

**Context.** Flow orchestration where nodes are bare leaves and edges are
events; sagas emerge from sequences of per-call windows (each step
commits its own work; compensations are leaves too). Depends conceptually
on story 8. Atomicity rule carries over: a sequence of bound leaves is a
saga, not a transaction — all-or-nothing groups must be one named leaf.

---

## 10. Publication

**Status:** blocked on owner decisions · **Type:** release

**Context.** The monorepo is not yet a git repository and nothing is on
npm. Steps: `git init` + first commit; decide build strategy (today the
`exports` point at TypeScript sources — fine for workspace use, needs a
decision for npm: ship sources vs build dist + d.ts); pick a license;
publish 0.0.x placeholders to reserve `@lntt/*` names on the npm org.

---

## 11. Load tests — TypeScript and JavaScript

**Status:** ready after story 1 informs the sizes · **Type:** validation

**Context.** Both halves of the contract deserve numbers, not anecdotes.

- **TS (the checker is a feature):** the inference and the guards are the
  product, so checker time under load is a regression to watch. Generate
  chains at realistic and extreme sizes (50/100+ layers, nested mounts,
  keyed forms, windows) and measure `tsc --noEmit` time and memory; find
  where instantiation-depth limits bite. Today's only data point: a
  20-step chain types in ~0.3s.
- **JS (runtime overhead):** quantify what the abstractions cost —
  per-call window overhead vs a direct call, bound-leaf calls vs naked
  calls, chain boot time vs a hand-written composition root at N layers,
  allocation profile of the prototype-chain bags in deep mounts.

**Done when:** a benchmark script lives in the repo (so numbers are
reproducible), baseline numbers are recorded, and a threshold exists for
"this PR made the checker N% slower".

---

## 12. TypeScript / Node compatibility matrix

**Status:** ready, gates publication (story 10) · **Type:** validation

**Context.** Everything is developed on TS 5.9 + Node 24, but nothing was
validated backwards. How far back can we honestly support?

- **Runtime floor:** the engine uses `Object.hasOwn` (Node ≥ 16.9),
  `??=` (ES2021), `Reflect.ownKeys`, prototype-chain bags; `@lntt/http`
  needs global fetch/Request/Response (Node ≥ 18). Likely floor: Node 18
  for http, possibly lower for wire — verify, don't guess.
- **TS floor:** the risky parts are not syntax but *inference behaviors*
  the design leans on: rank-2 `With<Deps>` inference through the bind
  overloads (with the intersection second-source trick), conditional
  tuple `RunArgs`/`BuildArgs`, `{} extends Seed` dispatch, overload
  resolution for the keyed/mount forms. These can silently differ across
  TS minors — the `*.test-d.ts` suite run under each TS version IS the
  validation.

**Done when:** CI runs the full suite (runtime + typecheck + test-d) on a
matrix of Node LTS versions and TS minors, the supported floors are
documented in the READMEs (`engines`, peer TS range), and unsupported
combinations fail loudly.

**Adoption angle — measure before committing to variants.** The goal is
to lower the barrier for teams on older toolchains, but "support old
TS/Node" splits into two very different asks, and the measurement here
decides which is even possible:
- **Node (runtime):** a downlevel/declaration-emit build covers older
  runtimes without touching the type contract — but it reverses ADR #24
  (`exports` point at `.ts` sources, build deferred). If the matrix shows
  real demand below the natural floor, this spawns a "downlevel build"
  follow-up story; until then it stays deferred.
- **TS (inference):** a "variant for old TS" is only admissible if the
  `test-d` suite still passes on that TS — i.e. the contract holds
  (principle #1). Where older TS degrades the inference, the types would
  lie, so there is NO variant: the floor is raised to the lowest TS that
  keeps the suite green. The measurement is the arbiter; no variant is
  promised ahead of it.

---

## 13. Retire the playground

**Status:** in progress — salvage done, deletion is the owner's call ·
**Type:** cleanup

**Context.** The design was born in `../playground` (outside this repo),
which remains a frozen lab. The goal is to work ONLY inside this
monorepo and eventually delete the playground. Salvage completed: the
order-free prototype lives in
[`research/order-free-layers/`](./research/order-free-layers/), the
type-lie demonstration became `packages/wire/src/why-collision-guard.test.ts`,
the extended pattern examples became `docs/patterns/`, and the full
decision record — decisions, discarded alternatives and why, distilled
from the lab's narrative history — is now
[`docs/decisions.md`](./docs/decisions.md). Deliberately NOT salvaged:
the early prototypes (their one insight — patch inference through a
generic `next` return type — is embedded in the engine and recorded in
the decisions) and the narrative itself.

**Done when:** the owner confirms nothing else is wanted and deletes
`../playground` (and the CLAUDE.md layout note about it is removed).

---

## 14. Grow the `docs/` folder

**Status:** started · **Type:** documentation

**Context.** `docs/` hosts the extended, code-complete versions of what
the package READMEs state in prose. Started with
`patterns/singletons-and-verticals.md` and `patterns/events-and-cqrs.md`.
Candidates to add: a windows deep-dive (0/1/N semantics, retry/breaker
composition), the testing cookbook (the full mock ladder with runnable
examples), a migration guide from a hand-written composition root.

---

## 15. Framework integration adapters for adoption

**Status:** RR7 ready (rides story 1) · the rest evidence-gated ·
**Type:** ecosystem

**Context.** Lowering the adoption barrier means meeting teams inside the
framework they already run. These are *integration* adapters (how a chain
plugs into a framework's request lifecycle), distinct from `@lntt/http`'s
swappable HTTP *engines* (ADR #11). All follow ADR #10 (dialects via
`pipe`, never verbs in the core) and ADR #5 (new surface only with a real
case in hand) — so the list is deliberately staged by demand, not built
speculatively all at once.

- **React Router 7 / Remix — lead, do first.** The design already carries
  the recipe: `build()` + `getLoadContext`, with the promise-memo for HMR
  (ADR #12). It is the reference `starter` stack and the shape of the
  story-1 replica, so it is genuinely case-driven. Extract the recipe into
  a reusable adapter once the replica proves it.
- **Next.js — evidence-gated.** Different lifecycle: no `getLoadContext`;
  hook into route handlers / server components, with the `worker`-style
  promise-memo for module re-evaluation (ADR #12). Open it when a real
  adopter brings this stack.
- **NestJS — evidence-gated, with a reservation.** Nest is itself a
  decorator+reflection DI container; running `@lntt/wire` inside it means
  two DI systems coexisting — exactly the ceremony this project rejects
  (ADR #19, the CLAUDE.md preamble). Worst value/friction ratio of the
  set; last, and only with a concrete case that justifies the overlap.

**Done when:** the RR7 adapter ships with the replica as its example;
Next/Nest remain documented-but-unbuilt until a real adopter pulls them.

---

## 16. Rewrite the `@lntt/wire` README around the incremental model

**Status:** future · **Type:** documentation

**Context.** Decision 26 made `use((ctx, next) => …)` the one primitive and
`provide`/`expose` (with optional `destroy`) sugar over it. The README still
presents the verbs as a flat table; it should instead *teach the model
incrementally* — start from the single primitive (the onion, `next(priv)`
private vs `next(priv, pub)` public, teardown after `next`), then introduce
`provide`/`expose` as the pre-built layers that cover the common case, then
the `destroy` acquire/release shape, then mount. The narrative makes the
"one primitive, everything else sugar" structure legible instead of listing
verbs as peers. (Owner to confirm the exact framing of "incremental"; this
captures the intent from the design conversation.)

---

## 17. `@lntt/config` — typed config as the seed

**Status:** design discussion pending · **Type:** design + package

**Context.** Every app turns raw input (`process.env`, a Cloudflare `env`
binding, a `.env` file) into the typed value the chain requires as its
**Seed** (`lunette<{ env: Env }>()`). The README already shows
`parseEnv(process.env)` as a hand-rolled concern. A small package would
standardize that boundary: parse + validate raw input into the typed
config that becomes the seed, with errors surfaced loudly at the edge.

**Open questions.**
- **Package or pattern?** lunette prefers conventions over packages (the
  db package was considered and dropped — decision 16). Config earns a
  package only if it carries weight beyond `schema.parse(process.env)`:
  env-source adapters, layered/overlaid config, secret indirection. The
  real bootstrap (story 1) is the test of whether it does.
- **Validator integration — agnostic, not Zod-locked.** Lean: accept any
  validator implementing **Standard Schema** (the cross-library spec that
  Zod, Valibot, ArkType implement) instead of hard-depending on Zod —
  Zod/Valibot/etc. as *optional peers*, consistent with the HTTP dialect's
  swappable engines (decision 11) and the no-ceremony stance (decision 19).
- **Cadence-agnostic parse.** Config feeds the seed, and the seed arrives
  at different cadences (boot, first-request via `worker`, per-request —
  the split flagged in story 2's ADR note). The parse must be a pure
  `parse(raw) -> Config` callable wherever the input appears (including
  inside `seedFrom(env)` on Workers).
- **Error convention.** A bad config at boot is infrastructure → it throws
  and fails loud; optional config with defaults is the parser's job, not
  the chain's.

**Done when:** decided in the discussion (package-vs-pattern first); if a
package, it parses raw input through a Standard-Schema validator into a
typed seed, with the validator an optional peer.
