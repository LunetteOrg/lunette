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
import { reactRouter } from '@lntt/integration/react-router'

// Mount @lntt/example-app on React Router 7. Routing is external (file-based);
// the pack gives `mount` (the getLoadContext-shaped build-once step) and
// `toLoader`/`toAction`, which turn the app's scopes into RR7 loaders/actions.
//
// `makePack` is the FACTORY: a fresh build-once pack plus every loader/action,
// optionally seeded with a caller-supplied `env` (e.g. DEV_MAIL_OUTBOX for an
// end-to-end sign-in) — else parsed from the host env.
export const makePack = (env?: Env) => {
  const pack = reactRouter(chain, (hostEnv) =>
    env ? { env } : { env: parseEnv((hostEnv ?? {}) as Record<string, string | undefined>) },
  )
  return {
    pack,
    // reads → loaders
    // The feed loader is composed INLINE here to show the single-host idiom — a
    // real app has one host and composes at the wiring, so no shared-scope
    // module is needed. The shared `*Scope` imports below are the multi-host
    // portability device; `feedScope` still ships as their documented form.
    feedLoader: pack.toLoader(scope().guard(feedGuard).handle(feedHandler)),
    postLoader: pack.toLoader(postScope),
    commentsLoader: pack.toLoader(commentsScope),
    meLoader: pack.toLoader(identityScope),
    // writes/auth → actions
    loginAction: pack.toAction(loginScope),
    verifyAction: pack.toAction(verifyScope),
    logoutAction: pack.toAction(logoutScope),
    publishPostAction: pack.toAction(publishPostScope),
    commentAction: pack.toAction(commentScope),
    setPreferenceAction: pack.toAction(setPreferenceScope),
  }
}

// The default instance (host env / defaults). In a real app:
// `export const getLoadContext = (env) => pack.mount(env)` in the server entry,
// and each route module exports its loader/action from here.
export const {
  pack,
  feedLoader,
  postLoader,
  commentsLoader,
  meLoader,
  loginAction,
  verifyAction,
  logoutAction,
  publishPostAction,
  commentAction,
  setPreferenceAction,
} = makePack()
