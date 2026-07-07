import type { Context } from 'hono'
import type { ScopeHandler } from '../scope/kit.ts'
import { outcomeToResponse } from './http-codec.ts'

// Hono adapter. Hono is Fetch-native: the handler returns a `Response`, so the
// HTTP codec's Response is handed back verbatim. `c.req.raw` is the request,
// `c.req.param()` the matched route params.
export const toHono =
  <R>(handler: ScopeHandler<R>) =>
  async (c: Context): Promise<Response> =>
    outcomeToResponse(await handler({ request: c.req.raw, params: c.req.param() }))
