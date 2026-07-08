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

// The heavy feature module, written as a CHAIN OF EXPOSES with a VOCABULARY
// STEP (see docs/patterns/feature-modules.md): one provide translates the
// infrastructure into the leaves' function-shaped language, once — every
// step below binds point-free (the binder is a provider: the ctx IS the
// deps). Its Seed mixes repos, services and — crucially — the render leaves
// (the render fragment's Pub feeding this fragment's Seed, checked at the
// mount point). The author leaves are the first exposed step, so the
// composed read leaves take them from the ctx: composition is step order,
// type-checked (move a read step above the authors step and the module does
// not compile).
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
}>()
  // ── the vocabulary step: infra → the leaves' language (alias = a provide)
  .provide((ctx) => ({
    getPost: ctx.postRepo.findById,
    createPost: ctx.postRepo.create,
    getComment: ctx.commentRepo.findById,
    createComment: ctx.commentRepo.create,
    getCommentCounts: ctx.commentRepo.countByPosts,
    listComments: ctx.commentRepo.listByPost,
  }))
  // ── authors: public AND in Ctx — the read steps below consume them
  .expose(bind({ getAuthor, getAuthors }))
  // ── write path
  .expose(bind({ publishPost }))
  .expose(bind({ composeComment }))
  // ── read path
  .expose(bind({ getPostForReading }))
  .expose(bind({ listFeed }))
  .expose(bind({ listCommentsForReading }))
  .as('threads')
