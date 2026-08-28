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
built app), owns build-once (memoized per process/isolate, seeded from the host
context — `process.env` on Node, `c.env` on a Worker), and gives you ONE function
that consumes a scope, used with the host's **native** routing.

Handlers are **self-sufficient**: each reads the app from its own pack, so
different chains really can serve routes in the same app. `mount` is therefore
**optional** on Hono and Express — register it only to reach the app OUTSIDE a
scope (your own middleware, a hand-written route, a healthcheck), where it
stashes the app under `contextKey` (default `'__wireApp'`; give two packs in one
app different keys). React Router is the same: `mount` is `getLoadContext`
there, useful only in a custom-server app that has somewhere to register one —
under `react-router-serve` there is nowhere, and loaders reach the app through
the pack regardless.

### Hono — native routing, typed `hc` client preserved

```ts
import { hono } from '@lntt/integration/hono'
import { Hono } from 'hono'
import { hc } from 'hono/client'

const w = hono(chain, (env) => ({ env }))
const app = new Hono()
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
app.get('/courses/:courseId', w.handler(courseHandler)) // params validated at runtime
```

A third argument carries the options: `contextKey` for `mount`'s slot —
`express(chain, seed, { contextKey: '__billingApp' })`. The request's origin is
not among them: it comes from Express itself (see below).

### The primitives — `/http` and `/node`

A pack is not magic: it is build-once plus two primitives, both public, so a host
we ship no pack for composes the same pieces instead of copying them.

`@lntt/integration/http` is host-agnostic — `serializeCookie`, and
`outcomeToResponse(outcome)` for a hand-wired host that RETURNS a `Response`
(`examples/cloudflare-workers/bare` is the one that uses it; the Hono and React
Router packs inline their own codec, since each answers through its host's
channel rather than a plain `Response`). `@lntt/integration/node` is its counterpart for hosts that WRITE onto
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
origin has to come from somewhere — and `toWebRequest` **does not guess it**.
`Host` and `X-Forwarded-*` are client headers, and deciding which to believe is
a policy about proxies that the host framework already owns: on Express it is
`app.set('trust proxy')`, which `req.protocol`/`req.host` answer to. The Express
pack reads the origin from there, so configuring Express configures this too.
`toWebRequest(req, origin)` takes it as a REQUIRED argument — a default would be
the same guess in different clothes, so a hand-wired host has to say where its
URLs resolve from (§40).

The URL a scope reads is also **re-anchored** on that origin: a request target
may carry an origin of its own (`GET http://elsewhere/p HTTP/1.1` is legal, and
so is `//elsewhere/p`), and `new URL(target, base)` would let it replace the
base. Only path and query survive — which also means the URL is normalised while
the router matched the raw target, so do not re-derive routing decisions from
`ctx.request.url`.

### React Router 7 — the loader/action recipe

A module-level singleton in a `.server` module, re-exported by the route
modules. No load context anywhere: loaders reach the app through the pack.

```ts
// app/wire.server.ts
export const web = reactRouter(chain, () => ({ env: process.env }))
export const courseLoader = web.toLoader(courseHandler)

// app/routes/courses.$courseId.tsx
export { courseLoader as loader } from '~/wire.server'
```

This is the only shape that works on every deployment. `getLoadContext` is a
parameter of the server ADAPTERS (`@react-router/express`,
`@react-router/node`), so it exists only once you have written a custom server:
under `react-router-serve` or `react-router dev` there is nowhere to register it,
and the default template ships no server file. On Workers, import `env` from
`cloudflare:workers` in that same module rather than threading bindings through
the request — which is what the framework's own Cloudflare template now does.

`web.mount(hostEnv)` remains for custom-server apps that want to seed at boot or
expose the app on the load context; it is not needed to serve a scope, and its
`WireContext` record is valid only WITHOUT the `v8_middleware` future flag (with
it, RR7's context is a `RouterContextProvider` read via `createContext`).

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
