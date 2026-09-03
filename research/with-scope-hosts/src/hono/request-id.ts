import { randomUUID } from 'node:crypto'
import type { Context } from 'hono'
import type { Next } from '@lntt/scope'

export const withRequestId = async (_app: {}, { c }: { readonly c: Context }, next: Next<{}>) => {
  c.header('x-request-id', randomUUID())
  return next({})
}
