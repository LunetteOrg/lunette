import expressApp, { type Express } from 'express'
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

// The MOUNT, and nothing else: the route table, on Express's native
// `app.get`/`app.post`. Everything above it — the chain, the pack, the env —
// lives in `bootstrap/`, so what is left on this page is exactly what is about
// Express. Read it next to `examples/hono/src/server.ts`: the two files differ
// only where the hosts do.
//
// Per-handler, no registrar, so different chains can serve routes on one app;
// params are validated at runtime (a returned 422) since Express ships no native
// validator. The SAME scopes the app unit-tests in isolation run here against
// the real chain.
//
// No `mount()`: handlers reach the app through the pack itself (§33). Register
// it only to read the app OUTSIDE a scope — your own middleware, a hand-written
// route — see @lntt/integration's README.
export const app: Express = expressApp()

// reads
// The feed is composed INLINE here to show the single-host idiom — a real app
// has one host and composes at the wiring, so no shared-scope module is
// needed. The shared `*Scope` imports above are the multi-host portability
// device; `feedScope` still ships as their documented form.
app.get('/feed', handler(scope().guard(feedGuard).handle(feedHandler)))
app.get('/posts/:postId', handler(postScope))
app.get('/posts/:postId/comments', handler(commentsScope))
app.get('/me', handler(identityScope))
// auth — the adapter streams the raw request body, so leaves read it directly
// (no express.json(), which would drain the stream before the Web Request).
app.post('/login', handler(loginScope))
app.post('/verify', handler(verifyScope))
app.post('/logout', handler(logoutScope))
// writes (gated)
app.post('/posts', handler(publishPostScope))
app.post('/posts/:postId/comments', handler(commentScope))
app.post('/me/preference', handler(setPreferenceScope))
