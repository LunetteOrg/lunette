import expressApp, { type Express, type RequestHandler } from 'express'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { runScope } from '@lntt/scope'
// The two node-side primitives — see the header for where the line sits.
import { renderOutcome, toWebRequest } from '@lntt/integration/node'
import type { Capability, CarrierGuard, DepGuard, Handler, RequestCarrier } from '@lntt/scope'
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

// The SAME app as `server.ts`, mounted with NO pack — this file IS the pack,
// written out. The guest posture (decision 33) says a host contributes only the
// terminal handler, and `.extend` leaves a scope a pure host-agnostic `Handler`
// (schema + prepare steps + guards + leaf); what follows is everything it takes
// to mount one, and it is two short sections.
//
// The line: what a pack COMPOSES is imported (`@lntt/integration/node` — the
// request lift and the outcome render, plumbing that knows nothing about
// scopes), what a pack IS stays written out here: build-once, the carrier, the
// `runScope` call, and the two brands that make a bad mount a compile error.
// That is the point — for a host we ship no pack for (Fastify, Koa, bare
// `node:http`), this handful of lines IS the port.
//
// Read it next to `server.ts`: the route table at the bottom is IDENTICAL, and
// `test/manual.test.ts` drives both apps through the same requests to prove the
// responses are too.

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

// ── 2. the mount: carrier in, outcome out ────────────────────────────────────
// The two imported primitives sit at either end of the per-request call.
// `toWebRequest` lifts Express's request into the Web `Request` the carrier
// holds — the scope sees it narrowed to `RequestHead` (no body accessors), so
// the body is reachable ONLY through the declared `.body`/`.form` channels, the
// runtime object being a full `Request` is what lets those channels read it
// (decision 34). `renderOutcome` writes the other end: the leaf's value, or the
// abort's `ResponseIntent`, plus the cookies the sink collected on BOTH
// branches. A THROW reaches neither — it stays infrastructure and Express turns
// it into a 500.
//
// Both are plumbing: no scope enters them. What they bracket is the part worth
// writing out, below.

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
      renderOutcome(
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
