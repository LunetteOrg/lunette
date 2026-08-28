// A TINY APP, wired twice. The domain is shared; the WIRING is per carrier —
// which is the shape that falls out of "each carrier owns its vocabulary".
// A domain function that returned an abort could not be shared, because the
// abort would already belong to one carrier.
import type { Schema } from './scope.ts'
import { scope } from './scope.ts'
import * as web from './http.ts'
import * as api from './rpc.ts'
import { http } from './http.ts'
import { rpc } from './rpc.ts'

// ── the domain: no vocabulary at all, only its own errors ───────────────────
export interface Post {
  readonly id: string
  readonly title: string
}
export type DomainError = { readonly _tag: 'PostNotFound' } | { readonly _tag: 'RateLimited' }
const isError = (x: unknown): x is DomainError =>
  typeof x === 'object' && x !== null && '_tag' in x

const POSTS: Record<string, Post> = { '1': { id: '1', title: 'hello' } }

// Shared by BOTH wirings, and shareable precisely because it says nothing about
// how a failure should look on the wire.
export const findPost = (id: string): Post | DomainError =>
  POSTS[id] ?? { _tag: 'PostNotFound' }

// ── a stand-in schema ────────────────────────────────────────────────────────
export const postIdSchema: Schema<{ postId: string }> = {
  parse: (raw) => {
    const r = raw as { postId?: unknown }
    return typeof r?.postId === 'string' && r.postId.length > 0
      ? { ok: true, value: { postId: r.postId } }
      : { ok: false, issues: [{ path: ['postId'], message: 'expected a non-empty string' }] }
  },
}

// ── wiring 1: HTTP ───────────────────────────────────────────────────────────
// The translation from a domain error to a response word lives HERE, next to
// the route, where the host is already known.
const webAbortFor = (e: DomainError) =>
  e._tag === 'PostNotFound' ? web.notFound({ error: e._tag }) : web.tooManyRequests()

export const postScopeWeb = scope()
  .extend(http)
  .params(postIdSchema)
  .guard((ctx) => {
    const found = findPost(ctx.params.postId)
    return isError(found) ? webAbortFor(found) : { post: found }
  })
  .handle((ctx) => ({ post: ctx.post }))

// The same route answering 201 with a body — the success side of the vocabulary.
export const createScopeWeb = scope()
  .extend(http)
  .params(postIdSchema)
  .handle((ctx) => web.json({ created: ctx.params.postId }, 201))

// A login that REDIRECTS. Perfectly correct here, and the reason `redirect`
// cannot be a word every host shares.
export const loginScopeWeb = scope()
  .extend(http)
  .params(postIdSchema)
  .guard((ctx) => (ctx.params.postId === 'me' ? { me: true } : web.redirect('/login')))
  .handle((ctx) => ({ me: ctx.me }))

// ── wiring 2: RPC ────────────────────────────────────────────────────────────
// Same domain function, different vocabulary, different input verb.
const apiAbortFor = (e: DomainError) =>
  e._tag === 'PostNotFound' ? api.notFound('no such post') : api.tooManyRequests()

export const postScopeRpc = scope()
  .extend(rpc)
  .input(postIdSchema)
  .guard((ctx) => {
    const found = findPost(ctx.params.postId)
    return isError(found) ? apiAbortFor(found) : { post: found }
  })
  .handle((ctx) => ({ post: ctx.post }))

// A guard returning TWO different intents — the case that broke every other
// shape of this mechanism, and compiles here.
export const throttledScopeWeb = scope()
  .extend(http)
  .params(postIdSchema)
  .guard((ctx) =>
    ctx.params.postId === 'banned'
      ? web.forbidden()
      : ctx.params.postId === 'slow'
        ? web.tooManyRequests()
        : { allowed: true },
  )
  .handle((ctx) => ({ allowed: ctx.allowed }))
