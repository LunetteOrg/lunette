import { chain } from '../bootstrap/chain.ts'
import type { App } from '../bootstrap/chain.ts'
import type { Env } from '../config/env.ts'
import type { Session } from '../domain/access.ts'
import { isError } from '../lib/errors.ts'
// The scope runtime lives in the sibling prototype (research/scope-runtime).
// Imported by relative path — no shipped packaging yet, this is a PoC proving
// the two prototypes compose. Compare every route below with its hand-rolled
// twin in ./routes.ts: the AFTER to that BEFORE.
import { httpError, notFound } from '../../../scope-runtime/src/scope/abort.ts'
import { fragment } from '../../../scope-runtime/src/scope/fragment.ts'
import { reactRouter } from '../../../scope-runtime/src/integrations/react-router.ts'

// The pain routes.ts repeats by hand — `const session = await
// context.app.getSession(request)` at the top of every loader/action — becomes
// ONE reusable guard. It reads its slice of the Pub surface (getSession) in the
// guard's dedicated app slot, reads the request off the carrier, and enriches
// the bag with `{ session }`. Every fragment below opens with it; none rewrites
// the session read.
const readSession = (
  app: Pick<App, 'getSession'>,
  _params: {},
  ctx: { request: Request },
): Promise<{ session: Session | null }> =>
  app.getSession(ctx.request).then((session) => ({ session }))

// AFTER of routes.ts `feedLoader`. The session read is the shared guard; the
// feed fetch is a second guard (the leaf never sees the app, so app access
// lives in guards and the leaf only SHAPES the response). No `context.app.`
// ceremony in the route body.
export const feedFragment = fragment()
  .guard(readSession)
  .guard((app: Pick<App, 'threads'>, _params: {}, _ctx) =>
    app.threads.listFeed('feed').then((feed) => ({ feed })),
  )
  .handle((deps) => ({ signedIn: deps.session !== null, feed: deps.feed }))

// AFTER of `postLoader`. The shared session guard again; then a prefetch guard
// that either enriches `{ post }` or ABORTS with `notFound()` — a RETURNED
// value, not the raw `throw new Response(null, { status: 404 })`. The viewer id
// flows from the prior guard's enrichment (`ctx.session`), typed, no re-read.
export const postFragment = fragment()
  .guard(readSession)
  .guard((app: Pick<App, 'threads'>, params: { postId: string }, ctx) =>
    app.threads
      .getPostForReading(params.postId, 'web', ctx.session?.userId)
      .then((post) => (isError(post) ? notFound() : { post })),
  )
  .handle((deps) => ({ post: deps.post }))

// AFTER of `loginAction`. One guard owns the whole side-effecting path (parse
// the form, validate, request the code); the leaf is a pure success shape. The
// invalid-email branch is a returned `httpError(422, …)` abort — see the note
// in the before/after write-up: routes.ts returns it as a 200 domain body, the
// scope model surfaces a domain-vs-abort question the prototype answers by
// mapping validation failure to a 4xx.
export const loginFragment = fragment().guard(
  async (app: Pick<App, 'access' | 'validateEmail'>, _params: {}, ctx) => {
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
