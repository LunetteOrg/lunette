import { Hono } from 'hono'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { scope } from '@lntt/scope'
import { z } from 'zod'
import type { Deps } from '../domain/deps.ts'
import { requireActor } from './guards.ts'
import { jsonBody, validated } from './validation.ts'
import { withRequestId } from './request-id.ts'
import { hono, honoCarrier } from './carrier.ts'
import { deps } from './bootstrap/index.ts'

const { route, mw } = hono(deps)

const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

export const getPost = route(
  scope(honoCarrier).step(async ({ posts }: Deps, { c }: { readonly c: Context<any, '/posts/:id'> }) => {
    const result = posts.getPost(c.req.param('id'))
    if ('notFound' in result) return c.notFound()
    return c.json(result)
  }),
)

export const publishPost = route(
  scope(honoCarrier)
    .step(requireActor)
    .step(async ({ posts }: Deps, { c }: { readonly c: Context<any, '/posts/:id/publish'> }) => {
      const result = posts.publishPost(c.req.param('id'))
      if ('notFound' in result) return c.notFound()
      return c.redirect(`/posts/${result.id}`, 303)
    }),
)

export const createPost = route(
  scope(honoCarrier)
    .step(jsonBody)
    .step(validated(CreatePostSchema))
    .step(
      async (
        { posts }: Deps,
        { c, body }: { readonly c: Context; readonly body: z.infer<typeof CreatePostSchema> },
      ) => c.json(posts.createPost(body), 201),
    ),
)

export const app = new Hono()

// The mirror of what Express's `express.json()` does automatically for a
// SyntaxError: Hono has no such built-in, so the mount states the
// translation itself — a genuine parse failure (thrown from `jsonBody`)
// becomes a 422; `HTTPException` answers itself (its own door, thrown from
// `requireActor`); anything else propagates.
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  if (err instanceof SyntaxError) return c.json({ error: 'invalid' }, 422)
  throw err
})

app.use(mw(scope(honoCarrier).step(withRequestId)))

app.get('/posts/:id', getPost)
app.post('/posts/:id/publish', publishPost)
app.post('/posts', createPost)
