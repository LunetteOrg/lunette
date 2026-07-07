# scope-runtime — wire as a guest, across three real hosts (issue #30)

Research validation, **not a product**. Proves posture 3 of
[`docs/design/scope-runtime.md`](../../docs/design/scope-runtime.md): wire is
a **guest** of the framework that holds the request. One guard/leaf model runs
unchanged behind **three real hosts** — React Router 7, Hono, Express — each
with its own adapter and outcome codec.

## What it proves

- **One model, three hosts.** `src/example.ts` defines the handlers once
  (`ownedCourse` + a cookie/redirect `login`). The adapters
  (`src/integrations/{react-router,hono,express}.ts`) carry them to each host
  verbatim — the leaf never changes. Driven for real: a React Router loader
  invoked with a `Request`, a Hono `app.request()`, an Express server over a
  real HTTP socket + `fetch`.
- **The ownership + prefetch guard.** `ownedCourse` authenticates, resolves
  the admin, then **prefetches the course and checks ownership** — enriching
  `deps` (typed, reused by the leaf: no refetch) or short-circuiting
  (`401` / `403` / `404`). Ownership is IN the route signature, not a
  forgettable line in every handler.
- **The type contract** (`src/scope/kit.test-d.ts`): a guard sees the app
  surface + request scope + every prior enrichment; reading an enrichment
  before its guard does not compile; the **leaf sees enrichments + scope but
  never the repos**.
- **The error convention meets HTTP.** A returned domain value → `200`; a
  returned abort → its intent (`redirect` / `4xx`); a THROW stays
  infrastructure (`5xx`). Cookies ride a mutable `scope.cookies` sink (fork 2)
  so the leaf's return stays the domain result.

## The key finding — guard is a typed fold, not a wire chain

The design framed a scope as "a chain seeded by the app". Building it surfaced
a sharper truth: the `guard` verb's **return-to-abort cannot be a wire layer**,
because wire's onion *requires* calling `next` and an abort is a RETURNED
domain value (a throw would be infrastructure). So the scope tier is a **typed
imperative fold** — accumulating enrichments per step (types like the boot
chain, fork 1), short-circuiting on a returned abort. This **confirms the
doc's (a)/(b) verdict**: the guard is a dialect over wire needing no core
"third slot". It is also lighter than a per-request wire chain, so the re-seed
perf spike (`packages/wire/test/limits/scope-reseed.spike.*`) measured the
heavier road — the fold is a fortiori fine.

## Layout

```
src/
  domain.ts · chain.ts            the app chain (repos as the scope-tier surface)
  scope/abort.ts                  Abort as a returned value; redirect / 4xx helpers
  scope/kit.ts                    scopeFor → guard (fluent stack) + handle (the fold)
  scope/kit.test-d.ts             the type contract
  scope/kit.test.ts               the fold at runtime (accumulate, short-circuit, cookies)
  example.ts                      one guard/leaf model, shared by every host
  integrations/http-codec.ts      Outcome → Response (React Router, Hono)
  integrations/react-router.ts    toLoader / toAction
  integrations/hono.ts            toHono
  integrations/express.ts         toExpress (Web Request ↔ node res)
  integrations/*.test.ts          each host driven for real
```

## Run

```
pnpm --filter @lntt/research-scope-runtime test
pnpm --filter @lntt/research-scope-runtime typecheck
```

## Open (deferred to the design)

- A leaf that needs an app **service** (not a repo) directly — today it comes
  through a passthrough guard; whether the app should expose a curated
  service surface to leaves is unsettled.
- Request-window ↔ transaction-window nesting when a prefetch guard must share
  the leaf's transaction (check-then-write). Not exercised here (reads only).
- `boot`/`mount` lifecycle (build once, HMR promise-memo, dispose) is elided:
  the tests build per case. The memoization recipe lives in the bootstrap
  replica's `react-router.ts`.
