import express from 'express'
import { z } from 'zod'
import { deps } from './bootstrap/index.ts'

const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

export const app = express()
app.use(express.json())

app.get('/posts/:id', (req, res) => {
  const result = deps.posts.getPost(req.params.id)
  if ('notFound' in result) {
    res.status(404).json({ error: 'not found' })
    return
  }
  res.json(result)
})

app.post('/posts/:id/publish', (req, res) => {
  const actor = req.header('x-actor-id')
  if (!actor) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  const result = deps.posts.publishPost(req.params.id)
  if ('notFound' in result) {
    res.status(404).json({ error: 'not found' })
    return
  }
  res.redirect(303, `/posts/${result.id}`)
})

app.post('/posts', (req, res) => {
  const parsed = CreatePostSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ error: 'invalid', issues: parsed.error.issues })
    return
  }
  const post = deps.posts.createPost(parsed.data)
  res.status(201).json(post)
})

// One catch-all: express.json() sets err.status/err.type on a malformed
// body, and this discards both, answering every error the same way.
app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(422).json({ error: 'invalid' })
})
