import { Hono } from 'hono'
import { scope } from '@lntt/scope'
import {
  commentScope,
  commentsScope,
  identityScope,
  feedGuard,
  loginScope,
  logoutScope,
  postScope,
  publishPostScope,
  setPreferenceScope,
  feedHandler,
  verifyScope,
} from '@lntt/example-app'
import { handler } from './bootstrap/index.ts'

// The MOUNT, and nothing else: the route table, in Hono's own native routing.
// Everything above it — the chain, the pack, the env — lives in `bootstrap/`,
// so what is left on this page is exactly what is about Hono. Read it next to
// `examples/express/src/server.ts`: the two files differ only where the hosts do.
//
// The SAME scopes the app defines — and unit-tests in isolation — are wired here
// through native chaining and the native validator, so `hc<AppType>()` stays
// fully typed (input and output).
//
// No `mount()`: handlers reach the app through the pack itself (§33). Register
// it only to read the app OUTSIDE a scope — see @lntt/integration's README.
export const app = new Hono()
  // reads
  // The feed is composed INLINE here to show the single-host idiom — a real app
  // has one host and composes at the wiring, so no shared-scope module is
  // needed. The shared `*Scope` imports above are the multi-host portability
  // device; `feedScope` still ships as their documented form.
  .get('/feed', ...handler(scope().guard(feedGuard).handle(feedHandler)))
  .get('/posts/:postId', ...handler(postScope))
  .get('/posts/:postId/comments', ...handler(commentsScope))
  .get('/me', ...handler(identityScope))
  // auth
  .post('/login', ...handler(loginScope))
  .post('/verify', ...handler(verifyScope))
  .post('/logout', ...handler(logoutScope))
  // writes (gated)
  .post('/posts', ...handler(publishPostScope))
  .post('/posts/:postId/comments', ...handler(commentScope))
  .post('/me/preference', ...handler(setPreferenceScope))

// The type a Hono RPC client (`hc<AppType>()`) consumes — routes, params, and
// the JSON each returns, all inferred from the scopes.
export type AppType = typeof app
