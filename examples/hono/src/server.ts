import { Hono } from 'hono'
import {
  chain,
  commentFragment,
  commentsFragment,
  feedFragment,
  identityFragment,
  loginFragment,
  logoutFragment,
  parseEnv,
  postFragment,
  publishPostFragment,
  setPreferenceFragment,
  verifyFragment,
} from '@lntt/example-app'
import { hono } from '@lntt/integration/hono'

// Mount @lntt/example-app on Hono. The pack takes the CHAIN and owns build-once;
// `seedFrom` maps the host env (Cloudflare `c.env`, or here the process env /
// defaults) to the chain's Seed `{ env }`. The SAME fragments the app defines —
// and unit-tests in isolation — are wired here with Hono's NATIVE routing, so
// `hc<typeof app>()` stays fully typed.
const w = hono(chain, (hostEnv) => ({
  env: parseEnv((hostEnv ?? {}) as Record<string, string | undefined>),
}))

export const app = new Hono()
  .use(w.mount())
  // reads
  .get('/feed', ...w.handler(feedFragment))
  .get('/posts/:postId', ...w.handler(postFragment))
  .get('/posts/:postId/comments', ...w.handler(commentsFragment))
  .get('/me', ...w.handler(identityFragment))
  // auth
  .post('/login', ...w.handler(loginFragment))
  .post('/verify', ...w.handler(verifyFragment))
  .post('/logout', ...w.handler(logoutFragment))
  // writes (gated)
  .post('/posts', ...w.handler(publishPostFragment))
  .post('/posts/:postId/comments', ...w.handler(commentFragment))
  .post('/me/preference', ...w.handler(setPreferenceFragment))

// The type a Hono RPC client (`hc<AppType>()`) consumes — routes, params, and
// the JSON each returns, all inferred from the fragments.
export type AppType = typeof app
