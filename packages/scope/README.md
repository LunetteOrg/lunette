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

A **fragment** is an abstract handler bound to no app. It declares:

- its **input** — one Standard Schema (zod / Valibot / ArkType) via `.input`;
- a stack of **guards** — cross-cutting steps (auth, ownership, prefetch) that
  enrich the context or short-circuit;
- a **leaf** — the use case, which reads the enrichments and returns a result.

Both guard and leaf are `(deps, ctx)`:

- `deps` — the handler's own dependencies, declared inline and structural
  (`{ sessionRepo: SessionRepo }`), reconciled against the app at the adapter;
- `ctx` — the carrier (`request` + `cookies` over HTTP) plus the validated
  `params` plus every prior guard's enrichment.

```ts
import { fragment, forbidden, notFound, unauthorized } from '@lntt/scope'
import { z } from 'zod'

export const courseHandler = fragment()
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

## Running a fragment

Hosts run a fragment through the fold; you rarely call these directly, but they
are the whole runtime:

- `runFold(handler, app, carrier, params)` — thread `app` through the guards to
  the leaf, short-circuit on an `Abort`, return an `Outcome`.
- `runScope(handler, app, carrier, rawInput)` — validate `rawInput` against the
  fragment's schema first (→ a returned `422` on failure), then fold.

Because a fragment is abstract, it is **testable in isolation** with plain fakes
— no host, no chain:

```ts
const out = await runScope(courseHandler,
  { sessionRepo, adminRepo, courseRepo, courseView }, // fakes
  { request }, { courseId: 'c1' })
```

## The adapter contract

A fragment binds to a concrete app only at the host adapter. A **missing
dependency** is a compile error at the adapter (`DepGuard` brand: the chain's
public surface must satisfy the fragment's accumulated `Need`). See
`@lntt/integration` for the per-host adapters (Hono, Express, React Router,
tRPC), each preserving its host's native routing and typed client.

## Status

Research-grade, pre-1.0, not yet published. Part of the scope-runtime work
tracked in issue #30.
