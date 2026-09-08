# examples

Example apps built on the shipped packages ([`@lntt/wire`](../packages/wire),
[`@lntt/scope`](../packages/scope)). Unlike `research/` (PoC proving behaviour,
out of review scope), these are usage references — in scope for review, meant
to be read and copied.

Tracked by #59, landing one slice at a time — reviewing a 191-file PR in one go
is the shape to avoid. `examples/bare-express`, from the previous core, does not
come back; see decision 50 in `docs/decisions.md` for why its whole premise
stopped applying.

## [`two-chains/`](./two-chains) — two products in one process

Two INDEPENDENT chains — a public catalogue and an admin area, each with its
own seed, services and disposable resource — mounted on the same Express
server. It answers "can several chains coexist in one host": each route is
served by the chain whose surface satisfies it, the two lifecycles are built
and disposed independently, and mounting a scope on the wrong chain's mount is
a **compile error** — `test/isolation.test-d.ts` carries both directions as
load-bearing negatives.

The admin product's gate (`src/admin.ts`) USES the pattern #67 closed on rather
than only describing it: one scope value, built once with `.guard()`, two routes
branching from it with `.step()`.

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
| [`hono/`](./hono) | Hono | the same `withId` base branched into TWO routes — the shape a carrier type argument made impossible (§53) — with `route` checking BOTH patterns against its schema; and the TYPED RPC CLIENT the transparent mount exists for: `hc<typeof app>()` reads back every answer the scope can give, as a discriminated union, with nothing written down twice |
| [`trpc/`](./trpc) | tRPC | ONE schema value serving both `.input(schema)` (tRPC reads and validates) and `.validate('input', schema, …)` (the scope types itself, and the mount is checked); a middleware growing the CONTEXT, which is what that unit is for — and where its override actually lands, pinned in both directions |
| [`rr7/`](./rr7) | React Router 7 | A REAL RR7 APP: `app/routes.ts`, route modules, and `Route.LoaderArgs` from the framework's own TYPEGEN (`typecheck` runs `react-router typegen` first). A loader beside the component that reads it, with `useLoaderData<typeof loader>()` typed by what the step returned and rendered to HTML through React Router's own static handler in the test; `params` refined by a schema with no read extension needed (React Router brings it already); an actor guard reading the SESSION COOKIE a form really sends, where the API entries read a header; and the check that replaces a route gate here — `satisfies Route.LoaderArgs` refusing a loader whose schema the route's own generated params do not supply |

**The same guard shape, on three hosts — and the READ is where they differ.**
`findActor` is written identically in `express/` and `hono/`, character for
character: it names no carrier, only the `headers` entry a read extension
populates, so the second host takes it unchanged. `rr7/`'s reads a session
COOKIE instead, and that difference is the host rather than a preference — its
action is what a browser `<Form>` submits to, and a form cannot set a custom
header. The guard's shape is what travels; which extension fills the entry it
names is the host's business.

## Run

```
pnpm --filter @lntt/example-app test
pnpm --filter @lntt/example-express test
pnpm --filter @lntt/example-hono test
pnpm --filter @lntt/example-trpc test
pnpm --filter @lntt/example-rr7 test
pnpm --filter @lntt/example-two-chains test
```
