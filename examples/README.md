# examples

Example apps built on the shipped packages ([`@lntt/wire`](../packages/wire),
[`@lntt/scope`](../packages/scope), [`@lntt/integration`](../packages/integration)).
Unlike `research/` (PoC proving wire's behaviour, out of review scope), these are
usage references — in scope for review, meant to be read and copied.

## [`app/`](./app) — the shared app (issue #1 structure)

A realistic React Router 7 + Drizzle composition root dissolved into an
`@lntt/wire` chain (config, db, repos, domain, use cases, feature modules). Its
use cases are host-agnostic `@lntt/scope` scopes (`app/handlers.ts`) that
declare their dependencies **explicitly** (the exact function shapes they call).
`app/handlers.test.ts` **unit-tests** each scope in isolation with plain fake
deps — no host, no chain, no database — showing a scope is a testable unit on
its own. The per-host wiring lives in the entry packages below, which import
`@lntt/example-app`.

## Per-host entries — mount the same app on each host

Each is a thin package: it imports `app`'s scopes and mounts them via
`@lntt/integration/<host>`, and its **integration test** drives the mounted host
against the real (in-memory PGlite) chain.

| entry | host | how | what its test drives |
|---|---|---|---|
| [`hono/`](./hono) | Hono | `app.get(path, ...w.handler(h))` | `app.request` + a typed `hc<AppType>()` client (`.test-d`) |
| [`express/`](./express) | Express | `app.get(path, w.handler(h))` | a real HTTP server + `fetch` |
| [`rr7/`](./rr7) | React Router 7 | `w.toLoader(h)` / `w.toAction(h)` | loaders/actions invoked with a `Request` |
| [`trpc/`](./trpc) | tRPC | `toProcedure(t.procedure, h)` | a typed server-side caller |

Unit tests (in `app/`) prove the scopes in isolation; integration tests (in
each entry) prove them mounted on a real host — the two halves of testing a
scope-runtime app.

## [`node-http/`](./node-http) — the same app, wired by hand

The four packs above are a **convenience, not a requirement**. `node-http/`
mounts the same scopes on bare `node:http` with **no `@lntt/integration` import
at all**: build the chain once, assemble the `RequestCarrier` from the native
request, call `runScope`, render the returned `Outcome`. Cookie serialization is
rewritten locally rather than borrowed from the integration package, and the
route table keeps `DepGuard`/`CarrierGuard` — both ship from `@lntt/scope`, so a
hand-wired host keeps its compile-time gates (`src/server.test-d.ts` proves the
negatives). It runs the same authenticated end-to-end round-trip as the others.

## Run

```
pnpm --filter @lntt/example-app test          # the app + unit tests
pnpm --filter @lntt/example-hono test         # (or -express / -rr7 / -trpc)
pnpm --filter @lntt/example-node-http test    # the adapter-free hand-wiring
```
