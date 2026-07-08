# @lntt/example-minimal

ONE `@lntt/scope` fragment model, served across **four hosts** — Hono,
Express, React Router 7, and tRPC — via the shipped `@lntt/integration`
subpaths. In-memory domain, no database.

## What it shows

The domain is an ownership + prefetch guard (`src/domain.ts`, `src/chain.ts`):
a session comes from a bearer token, an admin from the session's user, a course
carries an owner. The rule — authenticate, resolve the admin, prefetch the
course, check ownership — is written **once** as a fragment in
`src/handlers.ts` (`courseHandler`) plus pure decision functions.

Each host file wires that same fragment through its adapter, unchanged:

- `src/hono.ts` — `hono(chain, seedFrom)`: `.use(mount())` seeds the build,
  `.get(path, ...wire(handler))` plugs the validator + terminal into Hono's
  native chain, so `hc<typeof app>()` stays fully typed (see
  `test/hono.test-d.ts`).
- `src/express.ts` — `express(chain, seedFrom)`: `app.use(mount())` +
  `app.get(path, handler(frag))`.
- `src/react-router.ts` — `reactRouter(chain, seedFrom)`: `mount()` returns the
  load context, `toLoader(frag)` / `toAction(frag)` become RR7 loaders/actions.
- `src/trpc.ts` — `toProcedure(t.procedure, handler)`: the whole fragment folded
  into one native tRPC procedure, `AppRouter` type preserved.

The error convention is the pivot: a RETURNED `Abort` is a domain outcome —
`unauthorized()` → 401, `forbidden()` → 403, `notFound()` → 404 (a `FORBIDDEN`
/ `NOT_FOUND` `TRPCError` on the tRPC host).

## Run

```sh
pnpm --filter @lntt/example-minimal test
pnpm --filter @lntt/example-minimal typecheck
```
