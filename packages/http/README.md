# @lntt/http

> HTTP dialects for [`@lntt/wire`](../wire): routes as data with swappable
> engines, or the full native framework — your choice, per project.

## The engine-agnostic dialect (`@lntt/http`)

Routes are **data** (method + path + flat handler over the chain's public
surface): no engine owns them, so they are portable by construction.
Engines are adapters you swap in one argument:

```ts
import { http } from '@lntt/http'
import { honoEngine } from '@lntt/http/hono'       // or:
import { expressEngine } from '@lntt/http/express'

const app = chain
  .pipe(http)
  .middleware(async (req, next) => { ... })        // per-request onion
  .route('GET /posts', ({ posts }) => Response.json(posts.list()))
  .route('POST /posts', async ({ posts }, req) => { ... })

await app.serve(honoEngine(), seed, async ({ fetch }) => { ... })
```

- handlers receive the chain's **public surface** (contravariance-checked,
  like `bind`);
- `serve` has `run`'s shape: chain boot → engine up → scope → engine down →
  chain teardown;
- `worker(engine, seedFrom)` produces the Cloudflare Workers export shape —
  env arrives per request, so the boot is lazy and memoized per isolate;
- engine factories take an optional `setup` that hands you the naked
  framework app for **native middleware** — the coupling stays confined to
  that one block.

## The native dialects (`@lntt/http/hono`, `@lntt/http/express`)

When you want the framework's full API, the dialect gives you the real app
wired with the chain's deps:

```ts
import { hono } from '@lntt/http/hono'

chain
  .pipe(hono)
  .app(({ posts }, app) => {                       // deps by closure...
    app.use('*', cors())
    app.get('/posts', (c) => c.json(posts.list()))
    app.get('/x', (c) => c.json(c.var.deps.posts.list()))  // ...or typed c.var
  })
  .run(seed, async ({ fetch, app }) => { ... })    // or .worker(seedFrom)
```

A Hono sub-app is just a **value in the context**: each vertical block can
be a self-contained wire chain that requires the db through its Seed,
keeps its internals private, and exposes its sub-app — the main app mounts
them with Hono's own `app.route`. Wire composes the *dependencies*, the
framework composes the *routes*.

The trade-off is declared: native routes are not portable across engines.

## Install

```sh
pnpm add @lntt/http
pnpm add hono        # only if you import @lntt/http/hono
pnpm add express     # only if you import @lntt/http/express
```

`hono` and `express` are optional peer dependencies: importing only the
engine-agnostic entry point pulls in neither.
