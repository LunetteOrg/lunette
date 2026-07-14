import expressApp, { type Express } from 'express'
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
import type { Env } from '@lntt/example-app'
import { express } from '@lntt/integration/express'

// Mount @lntt/example-app on Express. Per-handler on native `app.get`/`app.post`
// (no registrar — so different chains could serve routes on one app); params
// are validated at runtime (a returned 422). The SAME fragments the app
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
  app.get('/feed', w.handler(feedFragment))
  app.get('/posts/:postId', w.handler(postFragment))
  app.get('/posts/:postId/comments', w.handler(commentsFragment))
  app.get('/me', w.handler(identityFragment))
  // auth — the adapter streams the raw request body, so leaves read it directly
  // (no express.json(), which would drain the stream before the Web Request).
  app.post('/login', w.handler(loginFragment))
  app.post('/verify', w.handler(verifyFragment))
  app.post('/logout', w.handler(logoutFragment))
  // writes (gated)
  app.post('/posts', w.handler(publishPostFragment))
  app.post('/posts/:postId/comments', w.handler(commentFragment))
  app.post('/me/preference', w.handler(setPreferenceFragment))
  return app
}
