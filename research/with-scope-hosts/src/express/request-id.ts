import { randomUUID } from 'node:crypto'
import type { Response } from 'express'
import type { Next } from '@lntt/scope'

export const withRequestId = async (
  _app: {},
  { res }: { readonly res: Response },
  next: Next<{}>,
) => {
  res.setHeader('x-request-id', randomUUID())
  return next({})
}
