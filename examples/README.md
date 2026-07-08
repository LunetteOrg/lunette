# examples

Example apps built on the shipped packages ([`@lntt/wire`](../packages/wire),
[`@lntt/scope`](../packages/scope), [`@lntt/integration`](../packages/integration)).
Unlike `research/` (PoC proving wire's behaviour, out of review scope), these are
usage references — in scope for review, meant to be read and copied.

## [`minimal/`](./minimal) — one model, four hosts

The compact demo: a single fragment (authenticate → resolve admin → prefetch a
course → ownership check), in-memory, served **unchanged** across Hono, Express,
React Router 7, and tRPC — only the adapter differs. Shows the typed clients
(`hc<typeof app>()`, tRPC caller) surviving the model. Start here.

## [`app/`](./app) — the broad app (issue #1 structure)

A realistic React Router 7 + Drizzle composition root dissolved into an
`@lntt/wire` chain (config, db, repos, domain, use cases, feature modules), with
its use cases exposed as `@lntt/scope` fragments (`app/handlers.ts`). The broad
counterpart to `minimal/`: same scope model, a real app's shape.

## Run

```
pnpm --filter @lntt/example-minimal test
pnpm --filter @lntt/example-app test
```
