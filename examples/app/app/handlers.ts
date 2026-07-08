import { z } from 'zod'
import { chain } from './bootstrap/chain.ts'
import type { App } from './bootstrap/chain.ts'
import type { Env } from './config/env.ts'
import type { Session } from './domain/access.ts'
import { isError } from './lib/errors.ts'
// The scope runtime ships as @lntt/scope (host-agnostic) plus @lntt/integration
// (per-host adapters). This example exposes its use cases as fragments and wires
// them into React Router 7 via the shipped packages.
import { fragment, httpError, notFound } from '@lntt/scope'
import { reactRouter } from '@lntt/integration/react-router'

// The session read that a hand-rolled loader would repeat — `const session =
// await context.app.getSession(request)` at the top of every loader/action —
// is ONE reusable guard here. It reads its slice of the Pub surface (getSession)
// in the guard's dedicated app slot, reads the request off the carrier, and
// enriches the bag with `{ session }`. Every fragment below opens with it; none
// rewrites the session read.
const readSession = (
  app: Pick<App, 'getSession'>,
  ctx: { request: Request },
): Promise<{ session: Session | null }> =>
  app.getSession(ctx.request).then((session) => ({ session }))

// The feed loader as a fragment. The session read is the shared guard; the
// feed fetch is a second guard (the leaf never sees the app, so app access
// lives in guards and the leaf only SHAPES the response). No `context.app.`
// ceremony in the route body.
export const feedFragment = fragment()
  .guard(readSession)
  .guard((app: Pick<App, 'threads'>, _ctx) =>
    app.threads.listFeed('feed').then((feed) => ({ feed })),
  )
  .handle((_deps: {}, ctx) => ({ signedIn: ctx.session !== null, feed: ctx.feed }))

// The post loader as a fragment. The shared session guard again; then a prefetch guard
// that either enriches `{ post }` or ABORTS with `notFound()` — a RETURNED
// value, not the raw `throw new Response(null, { status: 404 })`. The viewer id
// flows from the prior guard's enrichment (`ctx.session`), typed, no re-read.
export const postFragment = fragment()
  .input(z.object({ postId: z.string() }))
  .guard(readSession)
  .guard((app: Pick<App, 'threads'>, ctx) =>
    app.threads
      .getPostForReading(ctx.params.postId, 'web', ctx.session?.userId)
      .then((post) => (isError(post) ? notFound() : { post })),
  )
  .handle((_deps: {}, ctx) => ({ post: ctx.post }))

// The login action as a fragment. One guard owns the whole side-effecting path
// (parse the form, validate, request the code); the leaf is a pure success
// shape. The invalid-email branch is a returned `httpError(422, …)` abort: the
// scope model maps a validation failure to a 4xx rather than a 200 domain body.
export const loginFragment = fragment().guard(
  async (app: Pick<App, 'access' | 'validateEmail'>, ctx) => {
    const form = await ctx.request.formData()
    const email = String(form.get('email') ?? '')
    if (!app.validateEmail(email)) return httpError(422, { error: 'invalid-email' as const })
    await app.access.requestCode(email)
    return {}
  },
).handle(() => ({ ok: true as const }))

// The React Router pack takes the CHAIN and owns build-once + mount; seedFrom
// maps the host env to the chain's Seed `{ env }`. The fragment's app-deps are
// checked against this chain's Pub HERE, at `toLoader`/`toAction` — a fragment
// that read a repo the chain does not expose would be a compile error on the
// argument, not a runtime surprise.
export const pack = reactRouter(chain, (hostEnv) => ({ env: hostEnv as Env }))

export const feedLoader = pack.toLoader(feedFragment)
export const postLoader = pack.toLoader(postFragment)
export const loginAction = pack.toAction(loginFragment)
