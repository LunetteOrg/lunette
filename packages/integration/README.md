# @lntt/integration

Host adapters for [`@lntt/scope`](../scope): wire's scope runtime as a **guest**
of the framework that holds the request. One scope (guard/leaf) model runs
unchanged across every host — only the adapter and the outcome codec differ.

Tree-shakable per-host subpaths; import only what you use. Each framework is an
**optional peer dependency**.

```
@lntt/integration/hono          @lntt/integration/react-router
@lntt/integration/express       @lntt/integration/trpc
```

## The shape

Wire is a guest: it never wraps the router. Each pack takes the **chain** (not a
built app), owns build-once (`mount`, memoized per isolate, seeded from the host
context — `process.env` on Node, `c.env` on a Worker), and gives you ONE function
that consumes a scope, used with the host's **native** routing. Different
chains can serve routes in the same app (each `mount` stashes its app under its
own key).

### Hono — native routing, typed `hc` client preserved

```ts
import { hono } from '@lntt/integration/hono'
import { Hono } from 'hono'
import { hc } from 'hono/client'

const w = hono(chain, (env) => ({ env }))
const app = new Hono()
  .use(w.mount())
  .get('/courses/:courseId', ...w.handler(courseHandler))

// the RPC client stays fully typed (input + output):
const client = hc<typeof app>('/')
const res = await client.courses[':courseId'].$get({ param: { courseId: 'c1' } })
```

### Express — per-handler on native `app.get`

```ts
import { express } from '@lntt/integration/express'
const w = express(chain, () => ({ env: process.env }))
const app = expressApp()
app.use(w.mount())
app.get('/courses/:courseId', w.handler(courseHandler)) // params validated at runtime
```

### React Router 7 — the loader/action recipe

```ts
// app/scope.ts
export const web = reactRouter(chain, (env) => ({ env }))
// app/entry.server.ts
export const getLoadContext = (env) => web.mount(env)
// app/routes/courses.$courseId.tsx
export const loader = web.toLoader(courseHandler)
```

### tRPC — one call, typed `AppRouter` preserved

```ts
import { toProcedure } from '@lntt/integration/trpc'
const appRouter = t.router({
  courses: t.router({ get: toProcedure(t.procedure, courseHandler) }),
})
// caller/client fully typed — input from .input(schema), output from the leaf
```

The lower-level `guard` / `leaf` wrappers are also exported for hand-assembled
procedures.

## What each host trades

| host | routing | input check | typed client |
|---|---|---|---|
| Hono | native `.get(path, ...handler(h))` | native validator | `hc<typeof app>()` ✓ |
| Express | native `.get(path, handler(h))` | runtime (422) | — |
| React Router | file-based, `toLoader(h)` | runtime (422) | — |
| tRPC | native `.input().query()` | native `.input` | caller/client ✓ |

A missing dependency is a **compile error** at every adapter (`DepGuard`).

## Not included

The message-bus / event host (a `Message` carrier, `ack`/`nack`/dead-letter
codec) is deferred to `@lntt/listener` (issue #10); the retired prototype is
recoverable from git history.

## Status

Research-grade, pre-1.0, not yet published. Part of issue #30.
