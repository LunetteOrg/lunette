import { Hono } from 'hono'
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
import { hono } from '@lntt/integration/hono'

// Mount @lntt/example-app on Hono. The pack takes the CHAIN and owns build-once;
// `seedFrom` maps the host env (Cloudflare `c.env`, or here the process env /
// defaults) to the chain's Seed `{ env }`. The SAME scopes the app defines —
// and unit-tests in isolation — are wired here with Hono's NATIVE routing, so
// `hc<typeof app>()` stays fully typed.
//
// `makeApp` is the FACTORY: a fresh pack + routed app, optionally seeded with a
// caller-supplied `env` (else parsed from the host env). A build-once pack is a
// module singleton, so a test that needs a different env (e.g. DEV_MAIL_OUTBOX
// for an end-to-end sign-in) builds its OWN instance here rather than mutating
// the shared one.
export const makeApp = (env?: Env) => {
  const w = hono(chain, (hostEnv) =>
    env ? { env } : { env: parseEnv((hostEnv ?? {}) as Record<string, string | undefined>) },
  )
  return new Hono()
    .use(w.mount())
    // reads
    // The feed is composed INLINE here to show the single-host idiom — a real
    // app has one host and composes at the wiring, so no shared-scope module
    // is needed. The shared `*Scope` imports below are the multi-host
    // portability device; `feedScope` still ships as their documented form.
    .get('/feed', ...w.handler(scope().guard(feedGuard).handle(feedHandler)))
    .get('/posts/:postId', ...w.handler(postScope))
    .get('/posts/:postId/comments', ...w.handler(commentsScope))
    .get('/me', ...w.handler(identityScope))
    // auth
    .post('/login', ...w.handler(loginScope))
    .post('/verify', ...w.handler(verifyScope))
    .post('/logout', ...w.handler(logoutScope))
    // writes (gated)
    .post('/posts', ...w.handler(publishPostScope))
    .post('/posts/:postId/comments', ...w.handler(commentScope))
    .post('/me/preference', ...w.handler(setPreferenceScope))
}

// The default instance (host env / defaults) — what the server entry and the
// typed client consume.
export const app = makeApp()

// The type a Hono RPC client (`hc<AppType>()`) consumes — routes, params, and
// the JSON each returns, all inferred from the scopes.
export type AppType = typeof app
