import { randomUUID } from 'node:crypto'
import type { Context } from 'hono'
import type { Next } from '@lntt/scope'

// A plain step, mounted as MIDDLEWARE below — `app.use(...)`, across every
// route, rather than named on one. It derives nothing a route reads; it only
// writes a header before Hono's own `next()` runs.
//
// The Express twin of this file is the same eight lines with `res.setHeader`
// in place of `c.header`. That is the whole of what a step costs to move
// between hosts: the line that touches the framework.
export const withRequestId = async (_app: {}, { c }: { readonly c: Context }, next: Next<{}>) => {
  c.header('x-request-id', randomUUID())
  return next({})
}
