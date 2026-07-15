# @lntt/scope

The host-agnostic **scope runtime** for [`@lntt/wire`](../wire): a per-invocation
guard/leaf model with a typed input contract, run as a fold. Wire builds the app
once at boot; `@lntt/scope` handles what happens **per request** — authentication,
authorization, resource prefetch, and the use case itself — without an onion, an
AsyncLocalStorage, or a framework.

Framework-free by construction: its only runtime dependency is
[`@standard-schema/spec`](https://standardschema.dev) (types only). The host
adapters live in [`@lntt/integration`](../integration).

## The model

A **scope** is an abstract handler bound to no app. It declares:

- its **input** — one Standard Schema (zod / Valibot / ArkType) via `.input`;
- a stack of **guards** — cross-cutting steps (auth, ownership, prefetch) that
  enrich the context or short-circuit;
- a **leaf** — the use case, which reads the enrichments and returns a result.

Both guard and leaf are `(deps, ctx)`:

- `deps` — the handler's own dependencies, declared inline and structural
  (`{ sessionRepo: SessionRepo }`), reconciled against the app at the adapter;
- `ctx` — the validated `params` + every prior guard's enrichment + whatever the
  injected extensions add (`request`, `cookies`, `body`/`form`).

`scope()` is carrier-agnostic (`.input`/`.guard`/`.handle`, portable across any
host). Carrier capabilities are injected as tree-shakable EXTENSIONS, each mapping
to the hosts that support it — so a scope authored for a host never even sees the
channels that host lacks:

- **`@lntt/scope/request`** — `ctx.request` (read headers/session). Read-only, no
  capability → mounts everywhere, tRPC included.
- **`@lntt/scope/body`** — the `.body`/`.form` channels + the `body` capability →
  rejected on tRPC (no readable body).
- **`@lntt/scope/cookies`** — the `Set-Cookie` sink `ctx.cookies` + the `cookies`
  capability → rejected on tRPC (drops `Set-Cookie`).

A tRPC scope is `scope().extend(request)` — it cannot call `.body` (the method is
not there), so the mistake is impossible by construction, not caught late at the
mount. Reach for `request` when a guard reads the request:

```ts
import { scope, forbidden, notFound, unauthorized } from '@lntt/scope'
import { request } from '@lntt/scope/request'
import { z } from 'zod'

export const courseHandler = scope().extend(request)
  .input(z.object({ courseId: z.string() }))
  .guard(({ sessionRepo }: { sessionRepo: SessionRepo }, ctx) => {
    const session = sessionRepo.get(ctx.request)
    return session ? { session } : unauthorized()
  })
  .guard(({ adminRepo }: { adminRepo: AdminRepo }, ctx) => {
    const admin = adminRepo.byId(ctx.session.userId)
    return admin ? { admin } : forbidden()
  })
  .guard(({ courseRepo }: { courseRepo: CourseRepo }, ctx) => {
    const course = courseRepo.byId(ctx.params.courseId)
    if (!course) return notFound()
    return course.ownerId === ctx.admin.id ? { course } : forbidden()
  })
  // the leaf IS the use case: it declares its own service and delegates
  .handle(({ courseView }: { courseView: CourseView }, ctx) =>
    courseView.detail(ctx.course),
  )
```

## The error convention

A **returned** value is a domain outcome (a result, or an `Abort` like
`forbidden()` / `redirect()` — the codec maps it to a 4xx / redirect). A
**thrown** error is infrastructure (a 5xx / rollback / nack). A validation
failure of the input is a returned `422` — never a throw.

## Running a scope

Hosts run a scope through the fold; you rarely call these directly, but they
are the whole runtime:

- `runFold(handler, app, carrier, params)` — thread `app` through the guards to
  the leaf, short-circuit on an `Abort`, return an `Outcome`.
- `runScope(handler, app, carrier, rawInput)` — validate `rawInput` against the
  scope's schema first (→ a returned `422` on failure), then fold.

Because a scope is abstract, it is **testable in isolation** with plain fakes
— no host, no chain:

```ts
const out = await runScope(courseHandler,
  { sessionRepo, adminRepo, courseRepo, courseView }, // fakes
  { request }, { courseId: 'c1' })
```

## The adapter contract

A scope binds to a concrete app only at the host adapter. A **missing
dependency** is a compile error at the adapter (`DepGuard` brand: the chain's
public surface must satisfy the scope's accumulated `Need`). See
`@lntt/integration` for the per-host adapters (Hono, Express, React Router,
tRPC), each preserving its host's native routing and typed client.

## Status

Research-grade, pre-1.0, not yet published. Part of the scope-runtime work
tracked in issue #30.
