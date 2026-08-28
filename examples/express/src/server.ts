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
// `handler` takes the PATTERN and returns a tuple to spread — `app.get(
// ...handler('/posts/:postId', scope))` — so the route gate (pattern vs the
// scope's `.params()` schema) is written once and cannot drift from what is
// actually mounted. Params still validate at RUNTIME too (Express ships no
// native validator): a bad or missing param is a RETURNED 422.
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
app.get(...handler('/feed', scope().guard(feedGuard).handle(feedHandler)))
app.get(...handler('/posts/:postId', postScope))
app.get(...handler('/posts/:postId/comments', commentsScope))
app.get(...handler('/me', identityScope))
// auth — the adapter streams the raw request body, so leaves read it directly
// (no express.json(), which would drain the stream before the Web Request).
app.post(...handler('/login', loginScope))
app.post(...handler('/verify', verifyScope))
app.post(...handler('/logout', logoutScope))
// writes (gated)
app.post(...handler('/posts', publishPostScope))
app.post(...handler('/posts/:postId/comments', commentScope))
app.post(...handler('/me/preference', setPreferenceScope))
