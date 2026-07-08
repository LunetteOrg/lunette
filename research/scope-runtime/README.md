# scope-runtime — wire as a guest, across four real hosts (issue #30)

Research validation, **not a product**. Proves posture 3 of
[`docs/design/scope-runtime.md`](../../docs/design/scope-runtime.md): wire is
a **guest** of the framework that holds the request. One guard/leaf model runs
unchanged behind **four real hosts** — React Router 7, Hono, Express, tRPC —
each with its own adapter and outcome codec.

## What it proves

- **One model, four hosts.** `src/example.ts` defines the handlers once, as
  abstract **fragments** (`courseHandler` + a cookie/redirect `loginHandler`)
  bound to NO app. The host packs
  (`src/integrations/{react-router,hono,express,trpc}.ts`) carry them to each
  host verbatim — the leaf never changes. Driven for real: a React Router
  loader invoked with a `Request`, a Hono `app.request()`, an Express server
  over a real HTTP socket + `fetch`, and a tRPC `createCaller`.
- **One input contract per fragment — `.input(schema)`.** A fragment declares
  its input with a single **Standard Schema**
  ([standardschema.dev](https://standardschema.dev); here zod — the core types
  depend only on `@standard-schema/spec`, no hard zod dependency). That one
  schema yields the params type `OutputOf<schema>` every guard/leaf reads as
  `ctx.params`, feeds each host's native validator (Hono `sValidator`, tRPC
  `.input`, our RR7/Express/bus runtime validation), and drives coercion +
  validation → a RETURNED **422 domain abort** on failure (never a throw).
  Proven in `src/scope/fragment-input.*`.
- **Handlers are `(deps, ctx)`; the leaf declares its own deps.** Both guard
  and leaf take `(deps, ctx)`: `deps` is the handler's OWN app requirement
  (inline + structural, `{ sessionRepo: SessionRepo }`, in a dedicated first
  slot so `Need` stays recoverable); `ctx` is the carrier + validated `params`
  + prior enrichments. The **leaf IS the use case** — it declares the service
  it calls (`{ courseView }`), which accumulates into `Need` like a guard.
- **Handler-as-fragment, checked at the adapter.** A handler binds to a
  concrete app only at the adapter. A missing dep or a wrong param name is a
  **compile error at the adapter**, not a runtime surprise
  (`src/integrations/adapter.test-d.ts`): deps-vs-`Pub` by a brand. Params are
  the fragment's `.input` schema, validated natively (Hono `sValidator`, tRPC
  `.input`) or at runtime (Express, RR7, bus → a returned 422 on bad input).
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
  app slot + carrier ctx + its `params` (schema output) + every prior
  enrichment; reading an enrichment before its guard does not compile; the leaf
  reads its OWN declared services + carrier + enrichments, never the guards'
  repos.
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
  domain.ts · chain.ts            the app chain (repos + services as the scope-tier surface)
  scope/abort.ts                  Abort as a returned value; redirect / 4xx / 422 helpers
  scope/scope.ts                  carriers (RequestScope / JobScope) + cookie sink + Outcome
  scope/schema.ts                 Standard Schema projections: InputOf / OutputOf / unit
  scope/validate.ts               validateInput — coerce+validate a Standard Schema → params | 422 abort
  scope/fragment.ts               Fragment / Handler; fragment() / fragmentFor(); .input(schema)
  scope/run-fold.ts               runFold (the guard/leaf fold) + runScope (validate params, then fold)
  scope/adapter-guard.ts          DepGuard — the deps-vs-Pub brand
  scope/kit.ts                    the host-agnostic barrel (scopeFor → guard/handle/input)
  scope/kit.test-d.ts             the fragment type contract
  scope/kit.test.ts               the fold at runtime (accumulate, short-circuit, cookies)
  scope/fragment-input.test-d.ts  the .input contract: params typed by OutputOf<schema>
  scope/fragment-input.test.ts    .input at runtime: coercion + 422 domain abort on bad input
  example.ts                      one guard/leaf model (fragments) + pure decision fns, every host
  integrations/http-codec.ts      Outcome → Response (React Router, Hono, Express)
  integrations/react-router.ts    reactRouter(chain, seedFrom) → { guard, handle, toLoader, toAction, mount, dispose }
  integrations/hono.ts            hono(chain, seedFrom) → { mount, wire, dispose }; native app.get(path, ...wire(h))
  integrations/express.ts         express(chain, seedFrom) → { guard, handle, mount, handler, dispose }; native app.get(path, handler(h))
  integrations/trpc.ts            toProcedure(t.procedure, h) (one call) + guard / leaf / abortToTRPCError (lower-level)
  integrations/adapter.test-d.ts  the adapter contract (missing dep = compile error at the per-handler call)
  integrations/hono.test-d.ts     hc<typeof app>() stays typed (input + output) through the pack
  integrations/trpc.test-d.ts     the typed AppRouter / caller survives the hand-assembled procedure
  integrations/trpc-procedure.test-d.ts  toProcedure preserves the typed client (input + output), zero annotations
  integrations/job-codec.ts       Outcome → bus ack/nack; runJob over JobScope (the scope-KIND facet, #10)
  integrations/*.test.ts          each host driven for real (RR7, Hono, Express, tRPC, bus)
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

- Whether a SINGLE transaction should bracket the whole fold (multiple guards
  + the leaf) when a prefetch guard must share the leaf's transaction
  (check-then-write). Decision 33 nests the request window and a transaction
  window through the error convention; principle 7 dictates an explicit named
  window a guard opens and later guards receive as an enrichment, never an
  ambient join — left until a real case. Not exercised here (reads only).
- Per-request-varying seed: `mount`'s build memo is first-seed-wins per isolate
  (correct because the design's seed is isolate-static `env`). A seed that
  varies per request would break the single-app model — out of scope here.

(Resolved since the first prototype: a leaf that needs an app **service** no
longer routes through a passthrough guard — the leaf declares its OWN deps and
calls the service directly, reconciled against the chain's `Pub` at the
adapter.)
