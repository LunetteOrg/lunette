import expressApp, { type Express, type RequestHandler } from 'express'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { buildOnce } from '@lntt/wire'
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
  postScope,
  publishPostScope,
  setPreferenceScope,
  verifyScope,
} from '@lntt/example-app'
import type { App } from '@lntt/example-app'
import { hostEnv } from './config/env.ts'

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
// `@lntt/wire`'s own primitive: one app, built lazily on first use and
// memoized — the lifecycle of a chain belongs to the chain's package, not to a
// host. The handle lives INSIDE the factory, one per mount: the memo is per
// handle, so a second mount is a second app — which is why `server.ts` next
// door and this file each serve from their own chain. The seed is a THUNK,
// evaluated only on the build that happens (§36): being process-static it is
// read once, on the first request, and the per-call axis is the window, never a
// second app.

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

// The capabilities THIS carrier provides, and the line is a claim about
// MACHINERY, not a permission: `body` because `toWebRequest` streams the request
// into the Web Request, `cookies` and `headers` because `renderOutcome` writes
// both sinks onto the response. A host that could not do one of them narrows
// this set and every scope requiring it stops compiling at its mount line (§34).
//
// Narrowing is always safe — it only rejects more. WIDENING is the claim, so it
// belongs to whoever supplies the machinery: writing a capability here that
// `toWebRequest`/`renderOutcome` do not implement would open the gate on nothing.
type HostCaps = 'body' | 'cookies' | 'headers'

// The per-request call, and the only place the two brands are named:
// `DepGuard<App, Need>` fires if the chain's public surface does not cover what
// the scope's guards/leaf declare, `CarrierGuard<Cap, HostCaps>` if the scope
// needs a capability this carrier lacks — both compile errors at the mount line,
// naming the gap. Both ship from @lntt/scope, NOT from the adapters, which is
// why a hand-wired host keeps them (`server-manual.test-d.ts` proves the
// negatives). Params are validated at RUNTIME by `runScope` (Express has no
// native validator): a bad or missing param is a RETURNED 422.
export const makeHandler = () => {
  const { ensure, dispose } = buildOnce(chain)
  const handler =
    <Need extends object, S extends StandardSchemaV1, R, Cap extends Capability>(
      h: Handler<Need, S, R, Cap> & DepGuard<App, Need> & CarrierGuard<Cap, HostCaps>,
    ): RequestHandler =>
    async (req, res): Promise<void> =>
      renderOutcome(
        res,
        await runScope<RequestCarrier, S, R>(
          h,
          (await ensure(() => ({ env: hostEnv() }))).app,
          { request: toWebRequest(req) },
          req.params,
        ),
      )
  return { handler, dispose }
}

// `dispose` is the shipped pack's shape too: the mount hands it back and the
// process owner decides when to call it.
const { handler } = makeHandler()

// From here down this is `server.ts` verbatim — the wiring is the same work
// whether an adapter supplies `handler` or this file does. This module is the
// composition root and the mount at once, which is the one place it departs
// from the shape next door: what `bootstrap/index.ts` holds for the adapter-
// backed server is written out above.
export const app: Express = expressApp()

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
