import { Hono } from 'hono'
import { aboutScope, linkScope, listScope } from './chain.ts'
import { handler } from './bootstrap/index.ts'

// The MOUNT, and nothing else — the same shape as `examples/hono/src/server.ts`
// (§37), on Hono's native routing. Nothing on this page is Workers-specific:
// that lives one directory up, in `config/env.ts`.
const app = new Hono()
  .get('/links', ...handler(listScope))
  .get('/links/:slug', ...handler(linkScope))
  .get('/about', ...handler(aboutScope))

export type AppType = typeof app

// The Workers entry point: a module exporting a `fetch` handler. Hono's `app`
// already IS one, so the whole adaptation to the runtime is this line.
export default app
