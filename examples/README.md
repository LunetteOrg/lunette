# examples

Example apps built on the shipped packages ([`@lntt/wire`](../packages/wire),
[`@lntt/scope`](../packages/scope)). Unlike `research/` (PoC proving behaviour,
out of review scope), these are usage references — in scope for review, meant
to be read and copied.

Tracked by #59, landing one slice at a time — a 191-file PR in one go is the
shape `docs/design/scope-api.md` warns against. `examples/bare-express`, from
the previous core, does not come back; see decision 50 in `docs/decisions.md`
for why its whole premise stopped applying.

## [`two-chains/`](./two-chains) — two products in one process

Two INDEPENDENT chains — a public catalogue and an admin area, each with its
own seed, services and disposable resource — mounted on the same Express
server. It answers "can several chains coexist in one host": each route is
served by the chain whose surface satisfies it, the two lifecycles are built
and disposed independently, and mounting a scope on the wrong chain's mount is
a **compile error** — `test/isolation.test-d.ts` carries both directions as
load-bearing negatives.

The admin product's gate (`src/admin.ts`) uses the pattern #67 closed on
(`docs/design/scope-api.md`) rather than only describing it: one scope value,
built once with `.guard()`, two routes branching from it with `.step()`.

## [`app/`](./app) — the shared app

A small posts domain (`src/posts.ts`, unit-tested with no host and no chain in
the picture) dissolved into one `@lntt/wire` chain (`src/chain.ts`). Its public
surface — `Deps`, `src/deps.ts` — is what every per-host entry below builds
once and mounts.

## Per-host entries — mount the SAME app on each host

Each is its own package: it imports `app`'s chain and `Deps`, and mounts its
own routes with that host's `@lntt/scope/<host>` carrier.

| entry | host | what it demonstrates beyond routing |
|---|---|---|
| [`express/`](./express) | Express | route params VALIDATED with `.step(params).validate(...)` (a fifth read extension, decision 52), not merely typed by the carrier; `.step(headers).guard(...)` for the shared actor gate (#67's pattern again — here on a route rather than a whole product); `body('json', onError)` + `.validate(...)` with NO `express.json()` mounted (decision 48 + 49); and `AnswerGate` catching a real bug: `res.redirect(...)` returns `void`, not `Response` |

More entries (Hono, React Router, tRPC) land as their own slices.

## Run

```
pnpm --filter @lntt/example-app test
pnpm --filter @lntt/example-express test
pnpm --filter @lntt/example-two-chains test
```
