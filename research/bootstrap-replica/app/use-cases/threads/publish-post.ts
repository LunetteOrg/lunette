import type { Post, PostStatus } from '../../domain/threads.ts'
import type { DetectFormat, RenderUpfront } from '../../domain/render.ts'
import type { BlobStore } from '../../lib/blobs/index.ts'
import {
  type BodyImageRejected,
  DbOperationFailed,
  isError,
  PostBodyRequired,
  PostTitleRequired,
  RenderFailed,
} from '../../lib/errors.ts'
import { uploadInlineImages } from './store-body-images.ts'

export type PublishPostInput = {
  authorId: string
  title: string
  body: string
  status: PostStatus
  origFormat?: string
  idempotencyKey?: string
}

// A wide composition node (7 deps): validates, detects format, uploads inline
// images, creates the post, then — best-effort — warms the render cache for
// body and title. Domain errors RETURNED; infra (DbOperationFailed) THROWS,
// except the best-effort warm-up which is swallowed.
export type PublishPostDeps = {
  detectFormat: DetectFormat
  createPost: (post: Post) => Promise<Post>
  blobs: BlobStore
  generateId: () => string
  renderUpfront: RenderUpfront
  renderUpfrontTitle: RenderUpfront
}

export const publishPost = async (
  deps: PublishPostDeps,
  input: PublishPostInput,
): Promise<Post | PostTitleRequired | PostBodyRequired | BodyImageRejected> => {
  if (!input.title.trim()) return new PostTitleRequired()
  if (!input.body.trim()) return new PostBodyRequired()

  const id = input.idempotencyKey ?? deps.generateId()
  const uploaded = await uploadInlineImages({
    blobs: deps.blobs,
    html: input.body,
    entityType: 'post',
    entityId: id,
    generateId: deps.generateId,
  })
  if (isError(uploaded)) return uploaded

  const origFormat = await deps.detectFormat(uploaded.html, 'text', input.origFormat)
  const post = await deps.createPost({
    id,
    authorId: input.authorId,
    title: input.title,
    body: uploaded.html,
    origFormat,
    status: input.status,
    createdAt: new Date(),
  })

  if (input.status === 'published') {
    try {
      await Promise.all([
        deps.renderUpfront('post-body', id, uploaded.html),
        deps.renderUpfrontTitle('post-title', id, input.title),
      ])
    } catch (error) {
      // Warm-up is best-effort: a render or cache failure must not fail publish.
      if (!(error instanceof RenderFailed) && !(error instanceof DbOperationFailed)) throw error
    }
  }

  return post
}
