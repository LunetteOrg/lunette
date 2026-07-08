import expressApp, { type Express } from 'express'
import { chain, feedFragment, loginFragment, parseEnv, postFragment } from '@lntt/example-app'
import { express } from '@lntt/integration/express'

// Mount @lntt/example-app on Express. Per-handler on native `app.get`/`app.post`
// (no registrar — so different chains could serve routes on one app); params
// are validated at runtime (a returned 422). The SAME fragments the app
// unit-tests in isolation run here against the real chain.
const w = express(chain, () => ({ env: parseEnv({}) }))

export function makeApp(): Express {
  const app = expressApp()
  app.use(w.mount())
  app.get('/feed', w.handler(feedFragment))
  app.get('/posts/:postId', w.handler(postFragment))
  app.post('/login', w.handler(loginFragment))
  return app
}
