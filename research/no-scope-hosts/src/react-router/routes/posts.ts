import { data, type ActionFunctionArgs } from 'react-router'
import { z } from 'zod'
import { deps } from '../bootstrap/index.ts'

const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const body = await request.json()
    const parsed = CreatePostSchema.safeParse(body)
    if (!parsed.success) return data({ error: 'invalid', issues: parsed.error.issues }, { status: 422 })
    return deps.posts.createPost(parsed.data)
  } catch {
    return data({ error: 'invalid' }, { status: 422 })
  }
}
