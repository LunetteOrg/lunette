import expressLib from 'express'
import { z } from 'zod'
import { scope } from '@lntt/scope'
import { body, express, expressCarrier, headers, type HeaderEntries } from '@lntt/scope/express'
import { fail, guards } from '@lntt/scope/guard'
import type { Deps } from '@lntt/example-app'
import { deps } from './bootstrap/index.ts'
import { withRequestId } from './request-id.ts'

const { route, mw } = express(deps)

// The SHARED guards: carrier-free where they can be. `guard`'s check DERIVES;
// `onError` STOPS, and is this host's own answer (§47 — the same split every
// host's own gate takes).
//
// `readId` REPLACES the compile-time route ⟷ pattern check
// (`expressCarrier<{ id: string }>()` + `route`'s `PathGate`) with a
// RUNTIME one, deliberately: a route mounted with no `:id` at all now fails
// the FIRST request with 400 instead of being refused at compile time — but
// the schema also checks the param's FORMAT, which the carrier's bare
// `string` cast never did (`/posts/abc` reached the domain lookup before;
// now it never does). Traded, not lost; see the comparison this carried
// before landing, `docs/decisions.md` decision 52.
const readId = (_app: {}, { req }: { readonly req: { params: unknown } }) => {
  const result = z.object({ id: z.string().regex(/^\d+$/, 'must be numeric') }).safeParse(req.params)
  return result.success ? result.data : fail(result.error.issues.map((i) => ({ message: i.message })))
}

const findActor = (_app: {}, { headers: h }: { readonly headers: HeaderEntries }) =>
  h['x-actor-id'] ? { actor: h['x-actor-id'] } : fail([{ message: 'unauthorized' }])

const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

// A SCOPE VALUE IS THE RECYCLABLE UNIT (#67, `docs/design/scope-api.md`):
// `withId` is built once, and both routes below branch from it — the same
// pattern `examples/two-chains`' admin gate uses, here on a route rather
// than a whole product.
const withId = scope(expressCarrier())
  .extend(guards)
  .guard(readId, (issues, { res }) => res.status(400).json({ issues }))

export const getPost = route(
  '/posts/:id',
  withId.step(async ({ posts }: Deps, { id, res }) => {
    const result = posts.getPost(id)
    if ('notFound' in result) return res.status(404).json({ error: 'not found' })
    return res.json(result)
  }),
)

export const publishPost = route(
  '/posts/:id/publish',
  withId
    .step(headers)
    .guard(findActor, (issues, { res }) => res.status(401).json({ issues }))
    .step(async ({ posts }: Deps, { id, res }) => {
      const result = posts.publishPost(id)
      if ('notFound' in result) return res.status(404).json({ error: 'not found' })
      // `res.redirect` itself returns `void`, not `Response` — returning its
      // call directly would leave this branch `void`, and `AnswerGate`
      // refuses a leaf whose answer is not `Response | undefined` (a bare
      // `void` is not `undefined`, the same distinction `ReturnGate` draws
      // for a forgotten `next(...)`). `return undefined` says explicitly
      // that this leaf answered by writing to `res` and has nothing to hand
      // back.
      res.redirect(303, `/posts/${result.id}`)
      return undefined
    }),
)

// NO `express.json()` mounted anywhere in this file — decision 48's own
// recommendation, now that the reader it used to leave unbounded carries a
// default size limit of its own (decision 49). `body('json', onError)` reads
// the stream itself and is the single error path for a malformed, oversized
// or wrongly-encoded payload, on every route that calls it.
export const createPost = route(
  '/posts',
  scope(expressCarrier())
    .extend(guards)
    .step(body('json', (issues, { res }) => res.status(422).json({ issues })))
    .validate('body', CreatePostSchema, (issues, { res }) => res.status(422).json({ issues }))
    .step(async ({ posts }: Deps, { res, body: input }) => res.status(201).json(posts.createPost(input))),
)

export const app = expressLib()
app.use(mw(scope(expressCarrier()).step(withRequestId)))

app.get(...getPost)
app.post(...publishPost)
app.post(...createPost)
