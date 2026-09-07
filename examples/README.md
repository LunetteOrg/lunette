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

## Run

```
pnpm --filter @lntt/example-two-chains test
```
