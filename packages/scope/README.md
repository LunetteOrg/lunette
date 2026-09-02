# @lntt/scope

The host-agnostic **scope runtime** for [`@lntt/wire`](../wire): a per-invocation
guard/leaf model with a typed input contract, run as a fold. Wire builds the app
once at boot; `@lntt/scope` handles what happens **per request** — authentication,
authorization, resource prefetch, and the use case itself — without an onion, an
AsyncLocalStorage, or a framework.

Framework-free by construction, and dependency-free: the core has none at all,
not even types-only. The host adapters are set aside while the core is rebuilt,
and land as `@lntt/integration` once it settles.

> **This README describes the pre-#30 surface** (`.input`, `.guard`, `.handle`,
> `runScope`) and is being rewritten with the carriers. The shipped API today is
> `scope()`, `.step()` and `.extend()` — and nothing else: no carrier and no
> extension ship yet, so the Standard Schema validation described below is not
> there. It comes back per carrier (§41, #64).

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

- **`@lntt/scope/http`** — the HTTP carrier: `ctx.request`, the `.params(schema)`
  input verb, `.status(n)`, and the vocabulary its hosts render (`notFound()`,
  `forbidden()`, `redirect()`, `json(v, 201)`, …).
- **`@lntt/scope/trpc`** — the RPC carrier: `ctx.request`, the `.input(schema)`
  input verb (on RPC the input IS the payload), and its own words, which are
  codes rather than statuses. No `redirect`: an RPC reply has nowhere to go.
- **`@lntt/scope/body`** — the `.body`/`.form` channels + the `body` capability →
  rejected on tRPC (no readable body).
- **`@lntt/scope/cookies`** — the `Set-Cookie` sink `ctx.cookies` + the `cookies`
  capability → rejected on tRPC (drops `Set-Cookie`).

A carrier owns BOTH ends: what its scopes can read, and what they can say back.
A bare `scope()` has neither an input channel nor a way to abort — which is
right, since a scope with no carrier runs nowhere. The mistake is then
impossible by construction rather than caught late: a tRPC scope cannot call
`.body` (the method is not there), and it cannot `redirect()` either — that word
belongs to another carrier, and returning it is a compile error naming the
intent, at the guard that returned it.

```ts
import { scope } from '@lntt/scope'
import { http, forbidden, notFound, unauthorized } from '@lntt/scope/http'
import { z } from 'zod'

export const courseHandler = scope().extend(http)
  .params(z.object({ courseId: z.string() }))
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
dependency** is a compile error at the adapter (`DepGuard` brand: what the host
carries must satisfy the scope's accumulated `Need` — the chain's public surface
where a pack holds it, the tRPC context where the app travels in it). The
per-host adapters (Hono, Express, React Router, tRPC) — each preserving its
host's native routing and typed client — come back with `@lntt/integration`.

## Status

Research-grade, pre-1.0, not yet published. Part of the scope-runtime work
tracked in issue #30.
