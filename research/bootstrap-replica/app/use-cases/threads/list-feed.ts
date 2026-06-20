import type { AuthorIdentity } from '../../domain/profile.ts'
import type { RenderMany, Surface } from '../../domain/render.ts'
import type { FeedPost, PostRepository } from '../../domain/threads.ts'

// The batched node: every enrichment (titles, bodies, authors, counts) is one
// batched call — no N+1. Posts whose author was removed are dropped.
export type ListFeedDeps = {
  postRepo: Pick<PostRepository, 'listPublished'>
  getAuthors: (ids: readonly string[]) => Promise<Map<string, AuthorIdentity>>
  getRenderedMany: RenderMany
  getRenderedManyTitle: RenderMany
  getCommentCounts: (postIds: readonly string[]) => Promise<Map<string, number>>
}

export const listFeed = async (deps: ListFeedDeps, surface: Surface): Promise<FeedPost[]> => {
  const posts = await deps.postRepo.listPublished()
  const [bodies, titles, authors, counts] = await Promise.all([
    deps.getRenderedMany('post-body', posts.map((p) => ({ id: p.id, text: p.body })), surface),
    deps.getRenderedManyTitle('post-title', posts.map((p) => ({ id: p.id, text: p.title })), surface),
    deps.getAuthors(posts.map((p) => p.authorId)),
    deps.getCommentCounts(posts.map((p) => p.id)),
  ])

  return posts.flatMap((post) => {
    const author = authors.get(post.authorId)
    if (!author) return []
    return [
      {
        id: post.id,
        title: titles.get(post.id) ?? post.title,
        excerpt: (bodies.get(post.id) ?? post.body).slice(0, 140),
        authorName: author.name,
        authorColor: author.color,
        commentCount: counts.get(post.id) ?? 0,
      },
    ]
  })
}
