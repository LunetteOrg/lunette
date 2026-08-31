import type { BlobStore } from '../../lib/blobs/index.ts'
import { BodyImageRejected } from '../../lib/errors.ts'

// NOT a leaf injected by name: a shared helper that publish-post and
// compose-comment import and call directly (it has no wiring edge). Uploads
// inline data-url images and rewrites the html to point at the stored objects.
// A malformed data url is a DOMAIN error (RETURNED); a store failure is
// infrastructure (THROWN from blobs.put).
export type UploadInlineImagesInput = {
  blobs: BlobStore
  html: string
  entityType: string
  entityId: string
  generateId: () => string
}

const DATA_URL = /<img[^>]+src="(data:([^;]+);base64,([^"]+))"/g

export const uploadInlineImages = async (
  input: UploadInlineImagesInput,
): Promise<{ html: string; uploadedKeys: string[] } | BodyImageRejected> => {
  const matches = [...input.html.matchAll(DATA_URL)]
  let html = input.html
  const uploadedKeys: string[] = []

  // Blob uploads are outside any transaction window — the store can't roll
  // back. So on any failure (a malformed data url → domain reject, or a store
  // error → infra throw) we best-effort delete what we already uploaded, so a
  // half-done batch leaves no orphans behind.
  const compensate = async () => {
    await Promise.allSettled(uploadedKeys.map((key) => input.blobs.remove(key)))
  }

  try {
    for (const match of matches) {
      const [, dataUrl, contentType, base64] = match
      if (!dataUrl || !contentType || !base64) {
        await compensate()
        return new BodyImageRejected()
      }
      const ext = contentType.split('/')[1] ?? 'bin'
      const key = `${input.entityType}/${input.entityId}/${input.generateId()}.${ext}`
      await input.blobs.put(key, Buffer.from(base64, 'base64'), contentType)
      uploadedKeys.push(key)
      html = html.replace(dataUrl, input.blobs.url(key))
    }
  } catch (error) {
    await compensate()
    throw error
  }

  return { html, uploadedKeys }
}
