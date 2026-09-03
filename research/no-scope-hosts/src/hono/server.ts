import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { deps } from './bootstrap/index.ts'

const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

export const app = new Hono()
  .get('/posts/:id', (c) => {
    const result = deps.posts.getPost(c.req.param('id'))
    if ('notFound' in result) return c.notFound()
    return c.json(result)
  })

  .post('/posts/:id/publish', (c) => {
    const actor = c.req.header('x-actor-id')
    if (!actor) throw new HTTPException(401, { message: 'unauthorized' })
    const result = deps.posts.publishPost(c.req.param('id'))
    if ('notFound' in result) return c.notFound()
    return c.redirect(`/posts/${result.id}`, 303)
  })

  .post('/posts', async (c) => {
    try {
      const body = await c.req.json()
      const parsed = CreatePostSchema.safeParse(body)
      if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 422)
      const post = deps.posts.createPost(parsed.data)
      return c.json(post, 201)
    } catch {
      return c.json({ error: 'invalid' }, 422)
    }
  })
