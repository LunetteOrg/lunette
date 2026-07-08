import { reactRouter } from '@lntt/integration/react-router'
import { chain, type Env } from './chain.ts'
import { courseHandler } from './handlers.ts'

// The React Router 7 pack takes the CHAIN and owns build-once. `mount` is the
// getLoadContext-shaped seeding step (registered ONCE in the server entry); it
// returns the load context carrying the built app. `toLoader`/`toAction` turn a
// fragment into an RR7 loader/action reading that context back via args.context.
const pack = reactRouter(chain, (env) => ({ env: env as Env }))

export const mount = pack.mount
export const dispose = pack.dispose

// The recipe: a fragment → a loader (GET) or an action (mutation).
export const courseLoader = pack.toLoader(courseHandler)
export const courseAction = pack.toAction(courseHandler)
