import type { AuthorIdentity } from '../../domain/profile.ts'
import type { RenderOne, Surface } from '../../domain/render.ts'
import type { Post, PostForReading } from '../../domain/threads.ts'
import { PostNotFound } from '../../lib/errors.ts'

// A composition node wired only from other leaves (no repo of its own): it
// injects getPost, the body/title render leaves and getAuthor. Draft posts are
// invisible to anyone but their author; a removed author hides the post.
export type GetPostForReadingDeps = {
  getPost: (id: string) => Promise<Post | null>
  getRendered: RenderOne
  getRenderedTitle: RenderOne
  getAuthor: (id: string) => Promise<AuthorIdentity | null>
}

export const getPostForReading = async (
  deps: GetPostForReadingDeps,
  id: string,
  surface: Surface,
  viewerId?: string,
): Promise<PostForReading | PostNotFound> => {
  const post = await deps.getPost(id)
  if (!post) return new PostNotFound()
  if (post.status !== 'published' && post.authorId !== viewerId) return new PostNotFound()

  const [body, title, author] = await Promise.all([
    deps.getRendered('post-body', post.id, post.body, surface),
    deps.getRenderedTitle('post-title', post.id, post.title, surface),
    deps.getAuthor(post.authorId),
  ])
  if (!author) return new PostNotFound()

  return { id: post.id, title, body, authorName: author.name, authorColor: author.color, surface }
}
