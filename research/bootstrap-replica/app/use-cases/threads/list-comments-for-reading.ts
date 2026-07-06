import type { AuthorIdentity } from '../../domain/profile.ts'
import type { RenderMany, Surface } from '../../domain/render.ts'
import type { Comment, CommentForReading } from '../../domain/threads.ts'

export type ListCommentsForReadingDeps = {
  listComments: (postId: string) => Promise<Comment[]>
  getRenderedMany: RenderMany
  getAuthors: (ids: readonly string[]) => Promise<Map<string, AuthorIdentity>>
}

export const listCommentsForReading = async (
  deps: ListCommentsForReadingDeps,
  postId: string,
  surface: Surface,
): Promise<CommentForReading[]> => {
  const comments = await deps.listComments(postId)
  const [bodies, authors] = await Promise.all([
    deps.getRenderedMany('comment-body', comments.map((c) => ({ id: c.id, text: c.body })), surface),
    deps.getAuthors(comments.map((c) => c.authorId)),
  ])

  return comments.flatMap((comment) => {
    const author = authors.get(comment.authorId)
    if (!author) return []
    return [
      {
        id: comment.id,
        body: bodies.get(comment.id) ?? comment.body,
        authorName: author.name,
        authorColor: author.color,
      },
    ]
  })
}
