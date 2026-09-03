import expressLib from 'express'
import type { Request, Response } from 'express'
import { scope } from '@lntt/scope'
import { z } from 'zod'
import type { Deps } from '../domain/deps.ts'
import { requireActor } from './guards.ts'
import { validated } from './validation.ts'
import { withRequestId } from './request-id.ts'
import { express, expressCarrier } from './carrier.ts'
import { deps } from './bootstrap/index.ts'

const { route, mw } = express(deps)

const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

export const getPost = route(
  scope(expressCarrier).step(async ({ posts }: Deps, { req, res }) => {
    const result = posts.getPost(req.params.id as string)
    if ('notFound' in result) return res.status(404).json({ error: 'not found' })
    return res.json(result)
  }),
)

export const publishPost = route(
  scope(expressCarrier)
    .step(requireActor)
    .step(async ({ posts }: Deps, { req, res }: { readonly req: Request; readonly res: Response }) => {
      const result = posts.publishPost(req.params.id as string)
      if ('notFound' in result) return res.status(404).json({ error: 'not found' })
      return res.redirect(303, `/posts/${result.id}`)
    }),
)

export const createPost = route(
  scope(expressCarrier)
    .step(validated(CreatePostSchema))
    .step(
      async (
        { posts }: Deps,
        { res, body }: { readonly res: Response; readonly body: z.infer<typeof CreatePostSchema> },
      ) => {
        const post = posts.createPost(body)
        return res.status(201).json(post)
      },
    ),
)

export const app = expressLib()
app.use(expressLib.json())
app.use(mw(scope(expressCarrier).step(withRequestId)))

app.get('/posts/:id', getPost)
app.post('/posts/:id/publish', publishPost)
app.post('/posts', createPost)
