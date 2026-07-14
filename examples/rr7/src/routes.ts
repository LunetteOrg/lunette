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
import { reactRouter } from '@lntt/integration/react-router'

// Mount @lntt/example-app on React Router 7. Routing is external (file-based);
// the pack gives `mount` (the getLoadContext-shaped build-once step) and
// `toLoader`/`toAction`, which turn the app's fragments into RR7 loaders/actions.
export const pack = reactRouter(chain, (hostEnv) => ({
  env: parseEnv((hostEnv ?? {}) as Record<string, string | undefined>),
}))

// In a real app: `export const getLoadContext = (env) => pack.mount(env)` in the
// server entry, and each route module exports its loader/action:
// reads → loaders
export const feedLoader = pack.toLoader(feedFragment)
export const postLoader = pack.toLoader(postFragment)
export const commentsLoader = pack.toLoader(commentsFragment)
export const meLoader = pack.toLoader(identityFragment)
// writes/auth → actions
export const loginAction = pack.toAction(loginFragment)
export const verifyAction = pack.toAction(verifyFragment)
export const logoutAction = pack.toAction(logoutFragment)
export const publishPostAction = pack.toAction(publishPostFragment)
export const commentAction = pack.toAction(commentFragment)
export const setPreferenceAction = pack.toAction(setPreferenceFragment)
