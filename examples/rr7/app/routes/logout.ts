import { logoutScope } from '@lntt/example-app'
import { toAction } from '../bootstrap/index.ts'

// An action with no page: it drops the session cookie and returns a redirect
// intent, so there is nothing to render.
export const action = toAction(logoutScope)
