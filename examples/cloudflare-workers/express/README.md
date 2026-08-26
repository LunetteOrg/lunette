# `@lntt/example-workers-express`

**Express, on Cloudflare Workers, with the Node pack unchanged.** Of the two
Workers entries this is the severe one: Hono is what Workers apps use anyway,
whereas nothing about `@lntt/integration/express` was written with this runtime
in mind.

## What it demonstrates

**The pack runs unmodified.** `@lntt/integration/express` lifts an
`IncomingMessage` into a Web `Request` (`toWebRequest`), writes the outcome onto
a `ServerResponse` (`renderOutcome`), and brands the mount with
`DepGuard`/`CarrierGuard`. All of it is Node code, and all of it runs here
against a `node:http` server the runtime emulates. The guest posture (§33) says
a host adapter contributes only the terminal handler; this is what that buys —
a runtime the adapter knows nothing about, and no line of it changes.

**The bindings can only come from the config module.** Hono's pack can thread a
per-request host env (`c.env`), and that is why its `seedFrom` takes an
argument. Express has no such channel: a handler receives `req`, not a platform
env. So `import { env } from 'cloudflare:workers'` in `config/env.ts` is not one
option among several — it is the only way this example can work at all. The
claim that a config module is the single host-specific file stops being a
convenience and becomes load-bearing.

## The adaptation, in full

```ts
const port = 8787
app.listen(port)
export default httpServerHandler({ port })
```

Three lines at the bottom of `src/server.ts`, plus the `cloudflare:node`
import at the top. Everything above them is
`examples/express` with a different chain.

Cloudflare has supported `node:http` servers since August 2025, which fixes this
example's minimum runtime version: `nodejs_compat`, and a compatibility date
after 2025-08-15. Both are in `wrangler.jsonc`.

## The write path, which is the part only this entry tests

`POST /links` declares a `.body(schema)` channel, so the scope carries the `body`
capability (§34) and there is something for the mount gate to check. More to the
point: there is no `express.json()` — it would drain the stream before the Web
Request — so the body reaches the leaf through `toWebRequest`'s streaming branch,
the Node request object handed to `new Request` as its body with
`duplex: 'half'`, on a `node:http` server the runtime **emulates**.

That is the least-verified path of the Node pack on this runtime, and the one
where an emulation is most likely to diverge. It does not: the write round-trips,
a duplicate slug comes back as a RETURNED 409 domain error, and a body failing
the schema as a 422 from the channel's own validation.

## `app.listen()` at module scope — checked, not assumed

It was an open question whether binding a port while a module is being evaluated
trips the no-I/O-outside-a-request ban. It does not: nothing is opened, a port
is registered with an emulated server. `test/module-scope.node.test.ts` starts
this worker for real and asserts it serves.

The same file asserts the ban still bites for what really is I/O:
`test/fixture/eager-worker.ts` is this entry with the build moved out of the
thunk, and the runtime refuses to start it — the KV read, not the emulated
server:

```
Uncaught Error: Disallowed operation called within global scope.
```

## Two test projects

Same split as the Hono entry, for the same reason: `@cloudflare/vitest-plugin`
runs test bodies inside workerd and is right for behaviour, but it evaluates
modules from within a request, so the module-scope ban is invisible to it.
`createTestHarness` starts real workers from outside — the only vantage point
that sees it.

```sh
pnpm --filter @lntt/example-workers-express test
pnpm --filter @lntt/example-workers-express typecheck
```

Everything is local: Miniflare serves KV with no account and no credentials.
