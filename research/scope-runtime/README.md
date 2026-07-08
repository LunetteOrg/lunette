# scope-runtime — wire as a guest, across three real hosts (issue #30)

Research validation, **not a product**. Proves posture 3 of
[`docs/design/scope-runtime.md`](../../docs/design/scope-runtime.md): wire is
a **guest** of the framework that holds the request. One guard/leaf model runs
unchanged behind **three real hosts** — React Router 7, Hono, Express — each
with its own adapter and outcome codec.

## What it proves

- **One model, three hosts.** `src/example.ts` defines the handlers once, as
  abstract **fragments** (`courseHandler` + a cookie/redirect `loginHandler`)
  bound to NO app. The host packs
  (`src/integrations/{react-router,hono,express}.ts`) carry them to each host
  verbatim — the leaf never changes. Driven for real: a React Router loader
  invoked with a `Request`, a Hono `app.request()`, an Express server over a
  real HTTP socket + `fetch`.
- **Handler-as-fragment, checked at the adapter.** A handler declares two
  independent axes — its app **requirement** (`Need`, the repos each guard
  reads, in a dedicated first slot) and its route **params** (`P`, typed) —
  and binds to a concrete app only at the `to*`. A missing dep or a wrong
  param name is a **compile error at the adapter**, not a runtime surprise
  (`src/integrations/adapter.test-d.ts`): deps-vs-`Pub` by a brand, params by
  contravariance against the host's own route type (Hono inherit / Express
  parse / RR7 reconcile).
- **The packs own build-once + mount.** Each pack takes the **chain** (not a
  built app) and memoizes `build` per isolate; a `mount` step reads the host
  context (`c.env` on Hono, a middleware on Express, the load context on RR7),
  seeds the build, and stashes the app where the `to*` read it back.
- **The ownership + prefetch guard.** `courseHandler` authenticates, resolves
  the admin, then **prefetches the course and checks ownership** — enriching
  `deps` (typed, reused by the leaf: no refetch) or short-circuiting
  (`401` / `403` / `404`). Ownership is IN the route signature, not a
  forgettable line in every handler.
- **The type contract** (`src/scope/kit.test-d.ts`): a guard reads its declared
  app slot + carrier ctx + its params + every prior enrichment; reading an
  enrichment before its guard does not compile; the **leaf sees enrichments +
  carrier but never the repos**.
- **The error convention meets HTTP.** A returned domain value → `200`; a
  returned abort → its intent (`redirect` / `4xx`); a THROW stays
  infrastructure (`5xx`). Cookies ride a mutable `cookies` sink (fork 2)
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
  scope/scope.ts                  carriers (RequestScope / JobScope) + cookie sink + Outcome
  scope/fragment.ts               Fragment / Handler; fragment() / fragmentFor()
  scope/run-fold.ts               runFold — the guard fold, shared by every pack
  scope/adapter-guard.ts          DepGuard — the deps-vs-Pub brand
  scope/kit.ts                    the host-agnostic barrel (scopeFor → guard/handle)
  scope/kit.test-d.ts             the fragment type contract
  scope/kit.test.ts               the fold at runtime (accumulate, short-circuit, cookies)
  example.ts                      one guard/leaf model (fragments), shared by every host
  integrations/http-codec.ts      Outcome → Response (React Router, Hono)
  integrations/react-router.ts    reactRouter(chain) → { guard, handle, toLoader, toAction, mount, dispose }
  integrations/hono.ts            hono(chain) → { guard, handle, route, mount, dispose } (HonoParams<Path>)
  integrations/express.ts         express(chain) → { guard, handle, route, mount, dispose } (ExpressParams<Path>)
  integrations/adapter.test-d.ts  the adapter contract (missing dep / wrong param = compile error)
  integrations/job-codec.ts       Outcome → bus ack/nack; runJob over JobScope (the scope-KIND facet, #10)
  integrations/*.test.ts          each host driven for real
```

## Beyond HTTP — the codec is a facet (issue #10 groundwork)

`integrations/job-codec.*` renders the SAME host-agnostic `Outcome` the HTTP
codec renders, but as a message-bus acknowledgement: result→`ack`,
domain abort→`ack + dead-letter` (processed, do not retry, but flagged),
infra throw→`nack` (retry). And the INPUT side generalizes too: `fragmentFor`
swaps the carrier (`JobScope`, a `Message` instead of a `Request`) and `runJob`
runs the SAME `runFold` — a guard and leaf compose off HTTP unchanged. Evidence
BOTH facets are swappable, not HTTP assumptions.

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
- Per-request-varying seed: `mount`'s build memo is first-seed-wins per isolate
  (correct because the design's seed is isolate-static `env`). A seed that
  varies per request would break the single-app model — out of scope here.
