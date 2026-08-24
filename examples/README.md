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
| [`express/`](./express) | Express | `app.get(path, w.handler(h))` | a real HTTP server + `fetch`, and parity against the hand-wired mount below |
| [`rr7/`](./rr7) | React Router 7 | `w.toLoader(h)` / `w.toAction(h)` | loaders/actions invoked with a `Request` |
| [`trpc/`](./trpc) | tRPC | `toProcedure(t.procedure, h)` | a typed server-side caller |

Unit tests (in `app/`) prove the scopes in isolation; integration tests (in
each entry) prove them mounted on a real host — the two halves of testing a
scope-runtime app.

## Wiring a host by hand — [`express/src/server-manual.ts`](./express/src/server-manual.ts)

The packs above are a **convenience, not a requirement**. Next to the
adapter-backed `express/src/server.ts` sits the same app mounted with **no
pack** — the file IS the pack, written out: build the chain once, assemble the
`RequestCarrier`, call `runScope`, brand the mount. What a pack *composes* is
imported (`@lntt/integration/node` — the request lift and the outcome render,
plumbing that knows nothing about scopes); what a pack *is* stays on the page.
That is the answer to "what does porting to Fastify or Koa cost": this file. `test/manual.test.ts` drives **both** apps through the same requests
and asserts identical responses, so the two files are readable side by side as
"what the adapter does for you" vs "what it costs to do it yourself".

The hand-written mount keeps its compile-time gates: `DepGuard` and
`CarrierGuard` ship from `@lntt/scope`, not from the adapters, so naming them in
one signature is all it takes — `src/server-manual.test-d.ts` carries the
negatives, including a carrier that declares no `body` capability rejecting the
body-reading writes.

## Run

```
pnpm --filter @lntt/example-app test          # the app + unit tests
pnpm --filter @lntt/example-hono test         # (or -express / -rr7 / -trpc)
```
