import expressApp, { type Express, type RequestHandler, type Response as ExRes } from 'express'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { runScope } from '@lntt/scope'
// The ONE import from the integration package — see section 2 for why it does
// not weaken the exercise.
import { toWebRequest } from '@lntt/integration/node'
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

// The SAME app as `server.ts`, mounted with NO adapter. The host packs are a
// convenience, not a requirement of the guest posture (decision 33): `.extend`
// leaves a scope a pure host-agnostic `Handler` (schema + prepare steps + guards
// + leaf), so a host owes it exactly four things — the four sections below. Read
// this file next to `server.ts`: the route table at the bottom is IDENTICAL, and
// `test/manual.test.ts` drives both apps through the same requests to prove the
// responses are too.
//
// The one thing imported from @lntt/integration is the request lift (section 2),
// which knows nothing about scopes; NOTHING that mounts a scope is imported —
// the fold call, the outcome render and the two brands are all written out here.
// A Fetch-based host skips section 2 entirely.

// ── 1. build once ────────────────────────────────────────────────────────────
// First-seed-wins promise memo: one app per process, built lazily on the first
// request — `seedFrom` runs once, so a per-request-varying seed would be
// silently ignored. Correct because the design's seed is process-static (env);
// this is NOT a per-request cache.
type Built = Awaited<ReturnType<typeof chain.build>>

const buildOnce = (seedFrom: () => { env: Env }) => {
  let built: Promise<Built> | undefined
  return {
    // The PROMISE is memoized, not the resolved app: two requests racing the
    // very first call share the one build instead of each starting their own.
    ensure: (): Promise<Built> => (built ??= chain.build(seedFrom())),
    // The chain's teardown, reachable from the mount: build-once owns a
    // lifecycle (the db pool), so whoever owns the process closes it. Never
    // built, nothing to dispose.
    dispose: async (): Promise<void> => {
      if (built) await (await built).dispose()
    },
  }
}

// ── 2. the carrier ───────────────────────────────────────────────────────────
// The scope speaks Fetch, Express does not, so `RequestCarrier` needs the
// request lifted into a Web `Request`. This ONE import is where the line of the
// exercise sits: `toWebRequest` knows nothing about scopes — it is
// `IncomingMessage` → `Request` plus origin recovery, plumbing any Express app
// would need — while everything that MOUNTS a scope (the fold call, the outcome
// render, the brands) is written out below. Rewriting it here would only teach a
// weaker version of it: the shipped one handles TLS, `X-Forwarded-*` and the
// `allowedHosts` check that keeps a spoofed `Host` out of `ctx.request.url`.
//
// The scope sees the result narrowed to `RequestHead` (no body accessors), so
// the body is reachable ONLY through the declared `.body`/`.form` channels — the
// runtime object staying a full `Request` is what lets those channels read it
// (decision 34).

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
  const { ensure, dispose } = buildOnce(() => ({ env: env ?? parseEnv({}) }))
  const handler =
    <Need extends object, S extends StandardSchemaV1, R, Cap extends Capability>(
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
  return { handler, dispose }
}

export function makeApp(env?: Env): Express {
  // `dispose` is the shipped pack's shape too: the mount hands it back and the
  // process owner decides when to call it.
  const { handler } = makeHandler(env)

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
