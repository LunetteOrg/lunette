import type { Request as ExReq, Response as ExRes } from 'express'
import type { ScopeHandler } from '../scope/kit.ts'
import { serializeCookie } from './http-codec.ts'

// Express adapter. Express is NOT Fetch-based, so unlike React Router / Hono
// there is no Response to hand back: we translate the outcome onto the node
// `res` directly. The request scope still speaks Fetch — we lift express's
// `req` into a Web `Request` so the same handlers (which read `request`) run
// unchanged.
const toWebRequest = (req: ExReq): Request => {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v)
    else if (value !== undefined) headers.set(key, value)
  }
  return new Request(`http://localhost${req.originalUrl}`, { method: req.method, headers })
}

export const toExpress =
  <R>(handler: ScopeHandler<R>) =>
  async (req: ExReq, res: ExRes): Promise<void> => {
    const params: Record<string, string> = {}
    for (const [key, value] of Object.entries(req.params)) {
      params[key] = Array.isArray(value) ? (value[0] ?? '') : value
    }
    const outcome = await handler({ request: toWebRequest(req), params })

    for (const cookie of outcome.cookies) res.append('Set-Cookie', serializeCookie(cookie))

    if (outcome.ok) {
      res.status(200).json(outcome.value)
      return
    }
    const { intent } = outcome.abort
    if (intent.kind === 'redirect') {
      res.redirect(intent.status, intent.location)
      return
    }
    if (intent.body !== undefined) res.status(intent.status).json(intent.body)
    else res.status(intent.status).end()
  }
