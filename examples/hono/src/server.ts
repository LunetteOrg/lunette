import { Hono } from 'hono'
import { z } from 'zod'
import { scope } from '@lntt/scope'
import { body, headers, hono, honoCarrier, params, type HeaderEntries } from '@lntt/scope/hono'
import { fail, guards } from '@lntt/scope/guard'
import type { Deps } from '@lntt/example-app'
import { deps } from './bootstrap/index.ts'
import { withRequestId } from './request-id.ts'

const { route, mw } = hono(deps)

// `id` is VALIDATED, not merely read — `/posts/abc` never reaches the domain
// lookup. And the SAME schema is what `route` compares the mounted pattern
// against: `route('/posts', getPost)` does not compile, and says
//
//   ⛔ this route does not supply a param the scope validates: id
//
// so a pattern that would 400 on every request is refused where it is written.
const IdParam = z.object({ id: z.string().regex(/^\d+$/, 'must be numeric') })

// BYTE-IDENTICAL to `examples/express`'s guard, and that is the point: it names
// no carrier, only the `headers` entry a read extension populates — so it
// mounts on either host unchanged. The extraction is per host; everything
// downstream of it is not.
const findActor = (_app: {}, { headers: h }: { readonly headers: HeaderEntries }) =>
  h['x-actor-id'] ? { actor: h['x-actor-id'] } : fail([{ message: 'unauthorized' }])

const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

// A SCOPE VALUE IS THE RECYCLABLE UNIT: `withId` is built once and the two
// routes below branch from it, each adding its own steps. What it carries —
// the params read and their schema — is shared by both, and stated once.
const withId = scope(honoCarrier())
  .extend(guards)
  .step(params)
  .validate('params', IdParam, (issues, { c }) => c.json({ issues }, 400))

export const getPost = withId.step(async ({ posts }: Deps, { params: { id }, c }) => {
  const result = posts.getPost(id)
  if ('notFound' in result) return c.json({ error: 'not found' } as const, 404)
  return c.json(result)
})

export const publishPost = withId
  .step(headers)
  .guard(findActor, (issues, { c }) => c.json({ issues }, 401))
  .step(async ({ posts }: Deps, { params: { id }, c }) => {
    const result = posts.publishPost(id)
    if ('notFound' in result) return c.json({ error: 'not found' } as const, 404)
    return c.redirect(`/posts/${result.id}`, 303)
  })

// No body parser mounted anywhere: `body('json', onError)` reads the request
// itself and is the single error path for a malformed or oversized payload, so
// there is no framework-level 400 racing this one.
export const createPost = scope(honoCarrier())
  .extend(guards)
  .step(body('json', (issues, { c }) => c.json({ issues }, 422)))
  .validate('body', CreatePostSchema, (issues, { c }) => c.json({ issues }, 422))
  .step(async ({ posts }: Deps, { body: input, c }) => c.json(posts.createPost(input), 201))

// CHAINED ON PURPOSE, and it is the one thing this file does that its Express
// twin cannot. Hono builds its route SCHEMA into the app's own type as the
// calls chain, and `hc<typeof app>()` reads it back — path, method, and what
// each handler returns. The mounts here are transparent (they hand back what
// the SCOPE handed back), so every answer a route can give reaches the client
// as a type: the leaf's value, the domain's 404, the schema's 400, as one
// union. Written as separate `app.get(...)` statements the type would not
// accumulate and `hc` would have nothing to read.
//
// `server.test.ts` calls the client and narrows that union with no cast.
export const app = new Hono()
  .use(mw(scope(honoCarrier()).step(withRequestId)))
  .get(...route('/posts/:id', getPost))
  .post(...route('/posts/:id/publish', publishPost))
  .post(...route('/posts', createPost))

export type AppType = typeof app
