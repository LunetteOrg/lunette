# examples

Example apps built on the shipped packages ([`@lntt/wire`](../packages/wire),
[`@lntt/scope`](../packages/scope), [`@lntt/integration`](../packages/integration)).
Unlike `research/` (PoC proving wire's behaviour, out of review scope), these are
usage references — in scope for review, meant to be read and copied.

**What they demonstrate, and what they do not.** These entries exist to show how
the framework meets an application: where the chain is built, how a scope reaches
a host, what the mount gate checks, where the environment enters. They are NOT
working applications in the product sense, and their application logic is
deliberately the simplest thing that makes the wiring legible — a session that is
not revoked server-side, a cache read whole into memory, a check that is not
atomic. Copy the SHAPE of the wiring; do not copy the app around it. Where a
particular shortcut could mislead on its own, the file says so on the spot.

## [`app/`](./app) — the shared app (issue #1 structure)

A realistic React Router 7 + Drizzle composition root dissolved into an
`@lntt/wire` chain (config, db, repos, domain, use cases, feature modules). Its
use cases are host-agnostic `@lntt/scope` scopes (`app/handlers.ts`) that
declare their dependencies **explicitly** (the exact function shapes they call).
`app/handlers/*.test.ts` **unit-test** the pure functions those scopes delegate
to — no host, no chain, no database — while the scope wiring itself is exercised
by the per-host entries below. The per-host wiring lives in the entry packages below, which import
`@lntt/example-app`.

## Per-host entries — mount the same app on each host

Each is a thin package: it imports `app`'s scopes and mounts them via
`@lntt/integration/<host>`, and its tests drive the mounted host against the
real (in-memory PGlite) chain.

All four share **one layout** (§37), so that what differs between two of them is
only what is genuinely about the host:

```
config/env.ts        where the environment comes from — the ONE host-specific file
bootstrap/index.ts   the composition root: the pack, built once, re-exporting
                     what the mount uses
<the mount>          the route table — server.ts, router.ts, or routes/* on RR7
```

The mount never sees the chain, the pack or the env. `bootstrap/index.ts` is a
module singleton with no `makeApp(env?)` factory: a suite that needs a different
environment sets it before the first request, which works because the build is
lazy (§36) — the composition root reads the environment on the first request,
not at import. Between `hono/` and `express/` the two files above differ by one
import, one call and a comment.

| entry | host | how | what its test drives |
|---|---|---|---|
| [`hono/`](./hono) | Hono | `app.get(path, ...w.handler(h))` | `app.request` + a typed `hc<AppType>()` client (`.test-d`) |
| [`express/`](./express) | Express | `app.get(path, w.handler(h))` | a real HTTP server + `fetch`, and parity against the hand-wired mount below |
| [`rr7/`](./rr7) | React Router 7 | `w.toLoader(h)` / `w.toAction(h)` | loaders/actions invoked with a `Request` |
| [`trpc/`](./trpc) | tRPC | `toProcedure(t.procedure, h)` | a typed server-side caller |

### What each layer of test actually proves

The two kinds of file — `surface.test.ts` and `e2e.test.ts` — share a setup: the
real chain, the real host, a real round-trip. They differ in what they ask.
(`rr7` carries only the `e2e` half: its loaders are invoked directly, so a
per-route surface pass would repeat what the journey already covers.) `surface` judges each request on its own (does every route answer with
the shape its scope promises); `e2e` asks for a JOURNEY (a session cookie minted
by one request and honoured by the next). Neither is an *integration* test in
the isolate-one-component sense, and deliberately so: what they exercise is the
MOUNT, which exists only between a host and a chain, so both have to be real.

The tests that DO isolate one real component live where such a component
exists on its own:

| what is real | what is faked | where |
|---|---|---|
| nothing — pure functions | every dep | [`app/app/handlers/*.test.ts`](./app/app/handlers) |
| PGlite + Drizzle | no host, no chain | [`app/app/db/foundation.test.ts`](./app/app/db/foundation.test.ts), [`parity.test.ts`](./app/app/db/parity.test.ts) |
| the service selectors | the env they read | [`app/app/lib/services.test.ts`](./app/app/lib/services.test.ts) |
| the whole chain | only the mail transport | [`app/app/bootstrap/chain.test.ts`](./app/app/bootstrap/chain.test.ts) |
| the adapter + a real host | the chain (a fixture) | [`packages/integration/test`](../packages/integration/test) |
| the adapter + host + chain | nothing | `<entry>/test/surface.test.ts`, `e2e.test.ts` |

## [`cloudflare-workers/`](./cloudflare-workers) — the same shape, on a runtime that enforces it

Two standalone entries (own chain, KV-backed, no `@lntt/example-app` — PGlite
cannot run there) that make executable what the Node entries could only write in
a comment.

| entry | what only IT can show |
|---|---|
| [`cloudflare-workers/hono/`](./cloudflare-workers/hono) | `config/env.ts` swaps `process.env` for `import { env } from 'cloudflare:workers'` and nothing downstream changes; a module-scope build is REFUSED by the runtime; #39's mechanism reproduced (a KV write after the first request is not picked up) |
| [`cloudflare-workers/express/`](./cloudflare-workers/express) | the Node Express pack running UNCHANGED on `node:http` emulated by Workers (`httpServerHandler`), where `seedFrom` has no `c.env` to receive — so the config module is the only way bindings can arrive |
| [`cloudflare-workers/bare/`](./cloudflare-workers/bare) | the same chain with NO pack — `runScope` by hand, where the lazy build is mandatory rather than advisable, and the only thing an adapter turns out to buy is routing |

Two findings from building them, both correcting an assumption:

- **`@cloudflare/vitest-plugin` does not enforce the no-I/O-at-module-scope
  rule.** It loads modules through Vitest's module runner from within a request,
  so a module-scope `fetch()` goes straight through. `createTestHarness`
  (wrangler) starts a worker the way a deployment does and there the ban is
  real — hence the `hono` and `express` entries carry two vitest projects,
  `workerd` for behaviour and `node` for the rule. (`bare` carries only the
  `workerd` one: the rule is proved once per pack shape, not once per entry.)
- **The ban covers asynchronous I/O, not async work.** `crypto.subtle.digest` at
  module scope is fine; touching a BINDING is not. An in-memory chain proves
  nothing here, which is why these read KV.

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
