import expressApp, { type Express } from 'express'
import { scope } from '@lntt/scope'
import {
  chain,
  commentScope,
  commentsScope,
  identityScope,
  feedGuard,
  loginScope,
  logoutScope,
  parseEnv,
  postScope,
  publishPostScope,
  setPreferenceScope,
  feedHandler,
  verifyScope,
} from '@lntt/example-app'
import type { Env } from '@lntt/example-app'
import { express } from '@lntt/integration/express'

// Mount @lntt/example-app on Express. Per-handler on native `app.get`/`app.post`
// (no registrar — so different chains could serve routes on one app); params
// are validated at runtime (a returned 422). The SAME scopes the app
// unit-tests in isolation run here against the real chain.
//
// `makeApp` is the FACTORY: a fresh build-once pack + routed app, optionally
// seeded with a caller-supplied `env` (e.g. DEV_MAIL_OUTBOX for an end-to-end
// sign-in) — else the process defaults.
export function makeApp(env?: Env): Express {
  const w = express(chain, () => ({ env: env ?? parseEnv({}) }))
  const app = expressApp()
  app.use(w.mount())
  // reads
  // The feed is composed INLINE here to show the single-host idiom — a real app
  // has one host and composes at the wiring, so no shared-scope module is
  // needed. The shared `*Scope` imports below are the multi-host portability
  // device; `feedScope` still ships as their documented form.
  app.get('/feed', w.handler(scope().guard(feedGuard).handle(feedHandler)))
  app.get('/posts/:postId', w.handler(postScope))
  app.get('/posts/:postId/comments', w.handler(commentsScope))
  app.get('/me', w.handler(identityScope))
  // auth — the adapter streams the raw request body, so leaves read it directly
  // (no express.json(), which would drain the stream before the Web Request).
  app.post('/login', w.handler(loginScope))
  app.post('/verify', w.handler(verifyScope))
  app.post('/logout', w.handler(logoutScope))
  // writes (gated)
  app.post('/posts', w.handler(publishPostScope))
  app.post('/posts/:postId/comments', w.handler(commentScope))
  app.post('/me/preference', w.handler(setPreferenceScope))
  return app
}
