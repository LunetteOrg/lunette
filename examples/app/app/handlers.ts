import { z } from 'zod'
import type { Session } from './domain/access.ts'
import type { FeedPost, PostForReading } from './domain/threads.ts'
import { isError, type PostNotFound } from './lib/errors.ts'
// The scope runtime ships as @lntt/scope (host-agnostic) plus @lntt/integration
// (per-host adapters). This example exposes its use cases as fragments; the
// per-host wiring (build-once + mount + to*) lives in the separate entry
// packages (e.g. examples/rr7), which import these fragments unchanged.
import { fragment, httpError, notFound } from '@lntt/scope'

// Each guard declares its OWN dependencies as an explicit, self-contained
// structural type — the exact function shapes it calls, NOT a `Pick` from the
// whole `App`. A handler thus knows only the slice of the world it touches;
// the structural type still reconciles against the chain's Pub at the adapter
// (DepGuard) in the entry package, so a guard reaching for a repo the chain
// does not expose is a compile error there, on the argument.

// The session read that a hand-rolled loader would repeat — `const session =
// await context.app.getSession(request)` at the top of every loader/action —
// is ONE reusable guard here. It declares only `getSession`, reads the request
// off the carrier, and enriches the bag with `{ session }`. Every fragment
// below opens with it; none rewrites the session read.
const readSession = (
  deps: { getSession: (request: Request) => Promise<Session | null> },
  ctx: { request: Request },
): Promise<{ session: Session | null }> =>
  deps.getSession(ctx.request).then((session) => ({ session }))

// The feed loader as a fragment. The session read is the shared guard; the
// feed fetch is a second guard declaring only `threads.listFeed` (the leaf
// never sees the app, so app access lives in guards and the leaf only SHAPES
// the response). No `context.app.` ceremony in the route body.
export const feedFragment = fragment()
  .guard(readSession)
  .guard(
    (
      deps: { threads: { listFeed(scope: string): Promise<FeedPost[]> } },
      _ctx,
    ) => deps.threads.listFeed('feed').then((feed) => ({ feed })),
  )
  .handle((_deps: {}, ctx) => ({ signedIn: ctx.session !== null, feed: ctx.feed }))

// The post loader as a fragment. The shared session guard again; then a
// prefetch guard declaring only `threads.getPostForReading` that either
// enriches `{ post }` or ABORTS with `notFound()` — a RETURNED value, not the
// raw `throw new Response(null, { status: 404 })`. The viewer id flows from the
// prior guard's enrichment (`ctx.session`), typed, no re-read.
export const postFragment = fragment()
  .input(z.object({ postId: z.string() }))
  .guard(readSession)
  .guard(
    (
      deps: {
        threads: {
          getPostForReading(
            id: string,
            channel: 'web',
            viewer?: string,
          ): Promise<PostForReading | PostNotFound>
        }
      },
      ctx,
    ) =>
      deps.threads
        .getPostForReading(ctx.params.postId, 'web', ctx.session?.userId)
        .then((post) => (isError(post) ? notFound() : { post })),
  )
  .handle((_deps: {}, ctx) => ({ post: ctx.post }))

// The login action as a fragment. One guard owns the whole side-effecting path
// (parse the form, validate, request the code); it declares only the two
// functions it calls (`validateEmail`, `access.requestCode`). The leaf is a
// pure success shape. The invalid-email branch is a returned `httpError(422, …)`
// abort: the scope model maps a validation failure to a 4xx rather than a 200
// domain body.
export const loginFragment = fragment().guard(
  async (
    deps: {
      validateEmail(email: string): boolean
      access: { requestCode(email: string): Promise<void> }
    },
    ctx,
  ) => {
    const form = await ctx.request.formData()
    const email = String(form.get('email') ?? '')
    if (!deps.validateEmail(email)) return httpError(422, { error: 'invalid-email' as const })
    await deps.access.requestCode(email)
    return {}
  },
).handle(() => ({ ok: true as const }))
