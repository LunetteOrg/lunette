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

A third argument configures how the request's origin is recovered (see below):
`express(chain, seed, { allowedHosts: ['app.example.com'], trustProxy: true })`.

### The primitives — `/http` and `/node`

A pack is not magic: it is build-once plus two primitives, both public, so a host
we ship no pack for composes the same pieces instead of copying them.

`@lntt/integration/http` is host-agnostic — `serializeCookie`, and
`outcomeToResponse(outcome)` for hosts that RETURN a `Response` (Hono, React
Router). `@lntt/integration/node` is its counterpart for hosts that WRITE onto
one: `toWebRequest(req, options)` lifts an `IncomingMessage` into the Web
`Request` a `RequestCarrier` carries, and `renderOutcome(res, outcome)` writes
the outcome onto a `ServerResponse`. Express's `Response` and Fastify's
`res.raw` both ARE a `ServerResponse`, so those two serve every node host,
bare `node:http` included — the Express pack is their composition and nothing
more.

```ts
import { renderOutcome, toWebRequest } from '@lntt/integration/node'

const handler = (h) => async (req, res) =>
  renderOutcome(res, await runScope(h, app, { request: toWebRequest(req) }, req.params))
```

`examples/express/src/server-manual.ts` is a full working port on this shape,
tested side by side with the pack it replaces.

`new Request(...)` demands an absolute url while Node hands over a path, so an
origin has to be recovered from the request — and `Host` is a **client header**.
Taken as sent it can be spoofed into anything a scope builds from
`ctx.request.url` (a canonical link, an absolute redirect). The default matches
Express, Fastify and Koa themselves — the host as sent — and `allowedHosts`
narrows it to the hosts your app answers to, falling back to `origin`
(`http://localhost` unless given). `X-Forwarded-Proto`/`X-Forwarded-Host` are
ignored unless `trustProxy` says a proxy rewrites them.

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
