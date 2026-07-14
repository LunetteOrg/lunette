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
import { reactRouter } from '@lntt/integration/react-router'

// Mount @lntt/example-app on React Router 7. Routing is external (file-based);
// the pack gives `mount` (the getLoadContext-shaped build-once step) and
// `toLoader`/`toAction`, which turn the app's fragments into RR7 loaders/actions.
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
    feedLoader: pack.toLoader(feedFragment),
    postLoader: pack.toLoader(postFragment),
    commentsLoader: pack.toLoader(commentsFragment),
    meLoader: pack.toLoader(identityFragment),
    // writes/auth → actions
    loginAction: pack.toAction(loginFragment),
    verifyAction: pack.toAction(verifyFragment),
    logoutAction: pack.toAction(logoutFragment),
    publishPostAction: pack.toAction(publishPostFragment),
    commentAction: pack.toAction(commentFragment),
    setPreferenceAction: pack.toAction(setPreferenceFragment),
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
