import { Hono } from 'hono'
import { hono, type WireEnv } from '@lntt/integration/hono'
import { chain, type App, type Env } from './chain.ts'
import { courseHandler, loginHandler } from './handlers.ts'

// The Hono pack takes the CHAIN and owns build-once. `seedFrom` maps the host
// env to the chain's Seed. It contributes a `mount` middleware and a generic
// terminal (`wire`); the app is assembled with Hono's NATIVE chaining, so
// `typeof app` accumulates the route schema and `hc<typeof app>()` stays typed.
const w = hono(chain, () => ({ env: { label: 'hono' } satisfies Env }))

export const app = new Hono<WireEnv<App>>()
  .use(w.mount())
  .get('/courses/:courseId', ...w.wire(courseHandler))
  .post('/login', ...w.wire(loginHandler))

// The full app type — feed it to `hc<AppType>()` for a fully typed RPC client.
export type AppType = typeof app

export const dispose = w.dispose
