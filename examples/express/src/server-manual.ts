import expressApp, {
  type Express,
  type Request as ExReq,
  type RequestHandler,
  type Response as ExRes,
} from 'express'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { runScope } from '@lntt/scope'
import type {
  Capability,
  CarrierGuard,
  DepGuard,
  Handler,
  Outcome,
  RequestCarrier,
  SetCookie,
} from '@lntt/scope'
import {
  chain,
  commentScope,
  commentsScope,
  feedScope,
  identityScope,
  loginScope,
  logoutScope,
  parseEnv,
  postScope,
  publishPostScope,
  setPreferenceScope,
  verifyScope,
} from '@lntt/example-app'
import type { App, Env } from '@lntt/example-app'

// The SAME app as `server.ts`, mounted with NO `@lntt/integration` import at
// all. The host packs are a convenience, not a requirement of the guest posture
// (decision 33): `.extend` leaves a scope a pure host-agnostic `Handler`
// (schema + prepare steps + guards + leaf), so a host owes it exactly four
// things — the four sections below. Read this file next to `server.ts`: the
// route table at the bottom is IDENTICAL, and `test/manual.test.ts` drives both
// apps through the same requests to prove the responses are too.
//
// Nothing here is Express-specific insight. A host that is not Fetch-based
// lifts its request the same way; a Fetch-based one skips section 2 entirely.

// ── 1. build once ────────────────────────────────────────────────────────────
// First-seed-wins promise memo: one app per process, built lazily on the first
// request. Correct because the seed is process-static (env) — NOT a per-request
// cache, and a per-request-varying seed would break the model.
type Built = Awaited<ReturnType<typeof chain.build>>

const buildOnce = (seedFrom: () => { env: Env }) => {
  let built: Promise<Built> | undefined
  return (): Promise<Built> => (built ??= chain.build(seedFrom()))
}

// ── 2. the carrier ───────────────────────────────────────────────────────────
// The scope speaks Fetch, Express does not, so `RequestCarrier` is assembled by
// hand. The scope sees the request narrowed to `RequestHead` (no body
// accessors), so the body is reachable ONLY through the declared `.body`/`.form`
// channels — the runtime object stays a full `Request`, which is what lets those
// channels read it (decision 34).
const toWebRequest = (req: ExReq): Request => {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v)
    else if (value !== undefined) headers.set(key, value)
  }
  const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers }
  // GET/HEAD carry no body. For the rest the node stream IS the Web Request
  // body; a stream body requires `duplex: 'half'`.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    ;(init as { body?: unknown }).body = req
    init.duplex = 'half'
  }
  return new Request(`http://localhost${req.originalUrl}`, init)
}

// ── 3. rendering the outcome ─────────────────────────────────────────────────
// `Set-Cookie` serialization, rewritten locally on purpose: the shipped one
// lives in @lntt/integration and importing it would defeat the exercise. It is
// eight lines over the `SetCookie` shape the sink collects — a host needing more
// attributes writes them here, next to its own response code.
const serializeCookie = ({ name, value, options }: SetCookie): string => {
  const parts = [`${name}=${value}`]
  if (options.path !== undefined) parts.push(`Path=${options.path}`)
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)
  if (options.httpOnly === true) parts.push('HttpOnly')
  return parts.join('; ')
}

// The whole host-facing contract of a scope: `ok: true` is the leaf's value, a
// RETURNED abort carries its `ResponseIntent`, and the cookies the sink
// collected ride BOTH branches (a redirect that drops a session still has to
// emit its `Set-Cookie`). A THROW never reaches here — it stays infrastructure
// and Express's own error path turns it into a 500.
const render = (res: ExRes, outcome: Outcome<unknown>): void => {
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

// ── 4. the mount ─────────────────────────────────────────────────────────────
// The capabilities THIS carrier provides: Express streams the request body, so
// `body`; the response renders `Set-Cookie`, so `cookies`. A host that could not
// do one of them narrows this set and every scope requiring it stops compiling
// at its mount line (decision 34).
type HostCaps = 'body' | 'cookies'

// The per-request call, and the only place the two brands are named:
// `DepGuard<App, Need>` fires if the chain's public surface does not cover what
// the scope's guards/leaf declare, `CarrierGuard<Cap, HostCaps>` if the scope
// needs a capability this carrier lacks — both compile errors at the mount line,
// naming the gap. Both ship from @lntt/scope, NOT from the adapters, which is
// why a hand-wired host keeps them (`server-manual.test-d.ts` proves the
// negatives). Params are validated at RUNTIME by `runScope` (Express has no
// native validator): a bad or missing param is a RETURNED 422.
export const makeHandler = (env?: Env) => {
  const ensure = buildOnce(() => ({ env: env ?? parseEnv({}) }))
  return <Need extends object, S extends StandardSchemaV1, R, Cap extends Capability>(
      h: Handler<Need, S, R, Cap> & DepGuard<App, Need> & CarrierGuard<Cap, HostCaps>,
    ): RequestHandler =>
    async (req, res): Promise<void> =>
      render(
        res,
        await runScope<RequestCarrier, S, R>(
          h,
          (await ensure()).app,
          { request: toWebRequest(req) },
          req.params,
        ),
      )
}

export function makeApp(env?: Env): Express {
  const handler = makeHandler(env)

  // From here down this is `server.ts` verbatim — the wiring is the same work
  // whether an adapter supplies `handler` or this file does.
  const app = expressApp()
  // reads
  app.get('/feed', handler(feedScope))
  app.get('/posts/:postId', handler(postScope))
  app.get('/posts/:postId/comments', handler(commentsScope))
  app.get('/me', handler(identityScope))
  // auth — the raw request body streams into the Web Request, so the leaves
  // read it through `.form`/`.body` (no express.json(), which would drain it).
  app.post('/login', handler(loginScope))
  app.post('/verify', handler(verifyScope))
  app.post('/logout', handler(logoutScope))
  // writes (gated)
  app.post('/posts', handler(publishPostScope))
  app.post('/posts/:postId/comments', handler(commentScope))
  app.post('/me/preference', handler(setPreferenceScope))
  return app
}
