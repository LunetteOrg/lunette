import expressLib from 'express'
import { z } from 'zod'
import { scope } from '@lntt/scope'
import { body, express, expressCarrier, headers, params, type HeaderEntries } from '@lntt/scope/express'
import { fail, guards } from '@lntt/scope/guard'
import type { Deps } from '@lntt/example-app'
import { deps } from './bootstrap/index.ts'
import { withRequestId } from './request-id.ts'

const { route, mw } = express(deps)

// `id` is VALIDATED, not merely cast — `/posts/abc` never reaches the domain
// lookup. See decision 52 for why `.validate('params', ...)` over the
// carrier's type argument.
const IdParam = z.object({ id: z.string().regex(/^\d+$/, 'must be numeric') })

const findActor = (_app: {}, { headers: h }: { readonly headers: HeaderEntries }) =>
  h['x-actor-id'] ? { actor: h['x-actor-id'] } : fail([{ message: 'unauthorized' }])

const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

// A scope value is the recyclable unit (#67): built once, both routes below
// branch from it.
const withId = scope(expressCarrier())
  .extend(guards)
  .step(params)
  .validate('params', IdParam, (issues, { res }) => res.status(400).json({ issues }))

export const getPost = route(
  '/posts/:id',
  withId.step(async ({ posts }: Deps, { params: { id }, res }) => {
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
    .step(async ({ posts }: Deps, { params: { id }, res }) => {
      const result = posts.publishPost(id)
      if ('notFound' in result) return res.status(404).json({ error: 'not found' })
      // `res.redirect` returns `void`, not `Response` — returning it
      // directly fails `AnswerGate` (decision 51). `return undefined` says
      // explicitly that this leaf answered by writing to `res`.
      res.redirect(303, `/posts/${result.id}`)
      return undefined
    }),
)

// NO `express.json()` mounted anywhere in this file (decision 48 + 49):
// `body('json', onError)` reads the stream itself and is the single error
// path for a malformed, oversized or wrongly-encoded payload.
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
