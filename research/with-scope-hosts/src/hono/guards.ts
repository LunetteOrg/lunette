import { HTTPException } from 'hono/http-exception'
import type { Next } from '@lntt/scope'

// Hono's own idiomatic way to end a request early — the framework catches an
// `HTTPException` itself and turns it into its response, same door #76's
// no-scope spike already found (`src/hono/server.ts` there throws it too).
export const requireActor = async (
  _app: {},
  { c }: { readonly c: { req: { header(name: string): string | undefined } } },
  next: Next<{ actor: string }>,
) => {
  const actor = c.req.header('x-actor-id')
  if (!actor) throw new HTTPException(401, { message: 'unauthorized' })
  return next({ actor })
}
