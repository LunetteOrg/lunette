import type { Env } from '../../config/env.ts'
import { BlobOperationFailed } from '../errors.ts'

// Infra port: a public object store. Infrastructure failures THROW.
export type BlobStore = {
  url(key: string): string
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  remove(key: string): Promise<void>
}

// Feature flag — the real store ONLY when ALL FIVE BLOB_* are present (logical
// AND); otherwise the in-memory fake (the demo path, no credentials).
export const blobs = ({ env }: { env: Env }): BlobStore => {
  const real =
    env.BLOB_ENDPOINT &&
    env.BLOB_REGION &&
    env.BLOB_BUCKET &&
    env.BLOB_ACCESS_KEY &&
    env.BLOB_SECRET_KEY
  return real
    ? realBlobs({ endpoint: env.BLOB_ENDPOINT!, bucket: env.BLOB_BUCKET! })
    : fakeBlobs()
}

const realBlobs = (cfg: { endpoint: string; bucket: string }): BlobStore => ({
  url(key) {
    return `${cfg.endpoint}/${cfg.bucket}/${key}`
  },
  async put(key, bytes, contentType) {
    try {
      const res = await fetch(`${cfg.endpoint}/${cfg.bucket}/${key}`, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        // A copy, handed over as a plain `ArrayBuffer`: a `Uint8Array` is a
        // valid body for undici but the DOM lib types it over `ArrayBuffer`
        // rather than `ArrayBufferLike`, and this module is also compiled by
        // hosts that pull DOM in (a React Router app). An ArrayBuffer is a
        // `BodyInit` under both.
        body: bytes.slice().buffer as ArrayBuffer,
      })
      if (!res.ok) throw new Error(`blob store returned ${res.status}`)
    } catch (cause) {
      throw new BlobOperationFailed({ op: 'put', cause })
    }
  },
  async remove(key) {
    try {
      const res = await fetch(`${cfg.endpoint}/${cfg.bucket}/${key}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`blob store returned ${res.status}`)
    } catch (cause) {
      throw new BlobOperationFailed({ op: 'remove', cause })
    }
  },
})

const fakeBlobs = (): BlobStore => {
  const store = new Map<string, Uint8Array>()
  return {
    url(key) {
      return `memory://${key}`
    },
    async put(key, bytes) {
      store.set(key, bytes)
    },
    async remove(key) {
      store.delete(key)
    },
  }
}
