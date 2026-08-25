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

## [`bare-express/`](./bare-express) — adopting one layer at a time

The answer to "what if lunette ships no adapter for my host", and to the smaller
question underneath it: how much of lunette do I have to take?

- **Level one** (`src/level-1-chain-only.ts`) — `@lntt/wire` and nothing else.
  The chain is built once at module scope in `bootstrap.ts` (an ES module IS the
  singleton, so no memo is needed — that shape works on Node, not on Workers,
  where I/O at module scope is forbidden and `buildOnce` exists instead, §36).
  The handlers are ordinary Express handlers. If you only want the DI, you stop
  here.
- **Level two** (`src/level-2-scopes.ts`) — scopes on top, run by hand. Around
  forty lines do everything an adapter would: lift the request into the carrier,
  call `runScope`, render the `Outcome`, and brand the mount with `DepGuard` /
  `CarrierGuard` (both ship from `@lntt/scope`, so they survive). The diff
  against level one IS what scopes buy you: a declared input schema, a domain
  error as a RETURNED value, and the cookie sink rendered once instead of per
  route.

`@lntt/integration` is **not a dependency of this package**, and a test asserts
it — against the manifest and the imports, so the claim cannot rot.

## [`two-chains/`](./two-chains) — two products in one process

The smallest example, and the only one that does not import `app/`: two
INDEPENDENT chains — a public catalogue and an admin area, each with its own
seed, services and disposable resource — mounted on the same Express server.

It answers "can several chains coexist in one host": each route is served by the
pack whose chain satisfies it, the two lifecycles are built lazily and disposed
separately (the admin chain is never built if nobody calls it), and mounting a
scope on the wrong pack is a **compile error** — `test/isolation.test-d.ts`
carries both directions as load-bearing negatives.

## Run

```
pnpm --filter @lntt/example-app test          # the app + unit tests
pnpm --filter @lntt/example-hono test         # (or -express / -rr7 / -trpc)
pnpm --filter @lntt/example-two-chains test   # two chains, one server
pnpm --filter @lntt/example-bare-express test # wire alone, then scopes by hand
```
