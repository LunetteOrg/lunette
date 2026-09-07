import { randomUUID } from 'node:crypto'
import type { Response } from 'express'
import type { Next } from '@lntt/scope'

// A plain step, mounted as MIDDLEWARE below — `app.use(...)`, across every
// route, rather than named on one. It derives nothing a route reads; it only
// writes a header before Express's own `next()` runs.
export const withRequestId = async (_app: {}, { res }: { readonly res: Response }, next: Next<{}>) => {
  res.setHeader('x-request-id', randomUUID())
  return next({})
}
