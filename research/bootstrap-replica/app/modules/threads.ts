import { bind, lunette } from '@lntt/wire'
import type { UserRepository } from '../domain/access.ts'
import type {
  DetectFormat,
  RenderMany,
  RenderOne,
  RenderUpfront,
} from '../domain/render.ts'
import type { CommentRepository, PostRepository } from '../domain/threads.ts'
import type { BlobStore } from '../lib/blobs/index.ts'
import { getAuthor, getAuthors } from '../use-cases/threads/author-identity.ts'
import { composeComment } from '../use-cases/threads/compose-comment.ts'
import { getPostForReading } from '../use-cases/threads/get-post-for-reading.ts'
import { listCommentsForReading } from '../use-cases/threads/list-comments-for-reading.ts'
import { listFeed } from '../use-cases/threads/list-feed.ts'
import { publishPost } from '../use-cases/threads/publish-post.ts'

// The heavy feature module. Its Seed mixes repos, services and — crucially —
// the render leaves (the render fragment's Pub feeding this fragment's Seed,
// checked at the mount point). The author leaves are built first, then injected
// into the composed read leaves: composition by injected function dep, exactly
// the wiring edges the chain must reproduce.
export const threadsModule = lunette<{
  postRepo: PostRepository
  commentRepo: CommentRepository
  userRepo: UserRepository
  blobs: BlobStore
  generateId: () => string
  detectFormat: DetectFormat
  renderUpfront: RenderUpfront
  renderUpfrontTitle: RenderUpfront
  getRendered: RenderOne
  getRenderedTitle: RenderOne
  getRenderedMany: RenderMany
  getRenderedManyTitle: RenderMany
}>().expose('threads', (ctx) => {
  const authors = bind({ userRepo: ctx.userRepo }, { getAuthor, getAuthors })
  return {
    ...authors,
    ...bind(
      {
        detectFormat: ctx.detectFormat,
        createPost: ctx.postRepo.create,
        blobs: ctx.blobs,
        generateId: ctx.generateId,
        renderUpfront: ctx.renderUpfront,
        renderUpfrontTitle: ctx.renderUpfrontTitle,
      },
      { publishPost },
    ),
    ...bind(
      {
        getPost: ctx.postRepo.findById,
        getComment: ctx.commentRepo.findById,
        detectFormat: ctx.detectFormat,
        createComment: ctx.commentRepo.create,
        blobs: ctx.blobs,
        generateId: ctx.generateId,
        renderUpfront: ctx.renderUpfront,
      },
      { composeComment },
    ),
    ...bind(
      {
        getPost: ctx.postRepo.findById,
        getRendered: ctx.getRendered,
        getRenderedTitle: ctx.getRenderedTitle,
        getAuthor: authors.getAuthor,
      },
      { getPostForReading },
    ),
    ...bind(
      {
        postRepo: ctx.postRepo,
        getAuthors: authors.getAuthors,
        getRenderedMany: ctx.getRenderedMany,
        getRenderedManyTitle: ctx.getRenderedManyTitle,
        getCommentCounts: ctx.commentRepo.countByPosts,
      },
      { listFeed },
    ),
    ...bind(
      {
        listComments: ctx.commentRepo.listByPost,
        getRenderedMany: ctx.getRenderedMany,
        getAuthors: authors.getAuthors,
      },
      { listCommentsForReading },
    ),
  }
})
