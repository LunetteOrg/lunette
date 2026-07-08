# examples

Example apps built on the shipped packages ([`@lntt/wire`](../packages/wire),
[`@lntt/scope`](../packages/scope), [`@lntt/integration`](../packages/integration)).
Unlike `research/` (PoC proving wire's behaviour, out of review scope), these are
usage references — in scope for review, meant to be read and copied.

## [`app/`](./app) — the broad app (issue #1 structure)

A realistic React Router 7 + Drizzle composition root dissolved into an
`@lntt/wire` chain (config, db, repos, domain, use cases, feature modules), with
its use cases exposed as host-agnostic `@lntt/scope` fragments
(`app/handlers.ts`). The per-host wiring lives in separate entry packages that
import `@lntt/example-app`.

## Run

```
pnpm --filter @lntt/example-app test
```
