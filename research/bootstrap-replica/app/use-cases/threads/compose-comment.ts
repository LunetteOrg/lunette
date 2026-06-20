import type { Comment, Post } from '../../domain/threads.ts'
import type { DetectFormat, RenderUpfront } from '../../domain/render.ts'
import type { BlobStore } from '../../lib/blobs/index.ts'
import {
  type BodyImageRejected,
  CommentBodyRequired,
  DbOperationFailed,
  isError,
  ParentCommentNotFound,
  PostNotFound,
  RenderFailed,
} from '../../lib/errors.ts'
import { uploadInlineImages } from './store-body-images.ts'

export type ComposeCommentInput = {
  postId: string
  authorId: string
  parentId?: string
  body: string
  origFormat?: string
  idempotencyKey?: string
}

export type ComposeCommentDeps = {
  getPost: (id: string) => Promise<Post | null>
  getComment: (id: string) => Promise<Comment | null>
  detectFormat: DetectFormat
  createComment: (comment: Comment) => Promise<Comment>
  blobs: BlobStore
  generateId: () => string
  renderUpfront: RenderUpfront
}

export const composeComment = async (
  deps: ComposeCommentDeps,
  input: ComposeCommentInput,
): Promise<
  Comment | CommentBodyRequired | PostNotFound | ParentCommentNotFound | BodyImageRejected
> => {
  if (!input.body.trim()) return new CommentBodyRequired()
  if (!(await deps.getPost(input.postId))) return new PostNotFound()
  if (input.parentId && !(await deps.getComment(input.parentId)))
    return new ParentCommentNotFound()

  const id = input.idempotencyKey ?? deps.generateId()
  const uploaded = await uploadInlineImages({
    blobs: deps.blobs,
    html: input.body,
    entityType: 'comment',
    entityId: id,
    generateId: deps.generateId,
  })
  if (isError(uploaded)) return uploaded

  const origFormat = await deps.detectFormat(uploaded.html, 'text', input.origFormat)
  const comment = await deps.createComment({
    id,
    postId: input.postId,
    authorId: input.authorId,
    parentId: input.parentId ?? null,
    body: uploaded.html,
    origFormat,
    createdAt: new Date(),
  })

  try {
    await deps.renderUpfront('comment-body', id, uploaded.html)
  } catch (error) {
    if (!(error instanceof RenderFailed) && !(error instanceof DbOperationFailed)) throw error
  }

  return comment
}
