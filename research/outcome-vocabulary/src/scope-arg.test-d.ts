// The four things `scope(carrier)` has to prove before it is worth converting to.
import { describe, it } from 'vitest'
import { ABORT, type Abort, OK, type Ok } from './kernel.ts'
import { type CHANNEL, type Carrier, type Channel, type Handler, type MountGate, scope } from './scope-arg.ts'

interface Schema<T> {
  parse(raw: unknown): { ok: true; value: T } | { ok: false; issues: readonly [] }
}
declare const postId: Schema<{ postId: string }>

// ── the carriers ─────────────────────────────────────────────────────────────
interface Http extends Carrier {
  readonly __ctx?: { readonly request: { url: string } }
  readonly __declares?: { status: true; redirect: true; 'ok-status': true }
  readonly __admits?: { cookies: true; headers: true; body: true }
  params<T, Self = this>(this: Self, s: Schema<T>): Self & { readonly __params?: T }
  status<N extends number, Self = this>(this: Self, n: N): Self & { readonly __status?: N }
}
declare const http: Http

interface Rpc extends Carrier {
  readonly __ctx?: { readonly request: { url: string } }
  readonly __declares?: { code: true }
  // tRPC drops Set-Cookie, has no response headers and no readable body.
  input<T, Self = this>(this: Self, s: Schema<T>): Self & { readonly __params?: T }
}
declare const rpc: Rpc

// React Router IS a carrier: its escape hatch (`data(v, {status})`) is a
// response VALUE of its own, and today it is the one thing the gate cannot see
// — a leaf returning it mounts on Hono and silently serialises RR7's internal
// carrier as the body. Coining an intent for it is what closes that.
interface ReactRouter extends Carrier {
  readonly __ctx?: { readonly request: { url: string } }
  readonly __declares?: { status: true; redirect: true; 'rr7-data': true }
  params<T, Self = this>(this: Self, s: Schema<T>): Self & { readonly __params?: T }
}
declare const reactRouter: ReactRouter

// ── a channel, to prove carriers and channels still compose ──────────────────
interface Cookies extends Channel {
  readonly [CHANNEL]: true
  readonly __caps?: { cookies: true }
  readonly __ctx?: { readonly cookies: { set(k: string, v: string): void } }
}
declare const cookies: Cookies

declare const notFound: () => Abort<{ status: true }>
declare const redirect: (to: string) => Abort<{ redirect: true }>
declare const rpcNotFound: () => Abort<{ code: true }>
declare const rrData: <V>(v: V, init: { status: number }) => Ok<V, { 'rr7-data': true }>

declare function honoMount<R, Int>(
  h: Handler<R, Int> & MountGate<Int, 'status' | 'redirect' | 'ok-status'>,
): void
declare function trpcMount<R, Int>(h: Handler<R, Int> & MountGate<Int, 'code'>): void

// ── 1. the carrier brings its verbs, and the ctx it declares ─────────────────
const withHttp = scope(http)
  .extend(cookies)
  .params(postId)
  .guard((ctx) => {
    ctx.cookies.set('seen', '1')
    return ctx.params.postId === 'x' ? notFound() : { id: ctx.params.postId }
  })
  .handle((ctx) => ({ id: ctx.id, from: ctx.request.url }))
honoMount(withHttp)

// ── 2. the agnostic scope survives, and mounts EVERYWHERE ────────────────────
// `feedScope`/`listScope`/`aboutScope` in the real examples are exactly this.
const agnostic = scope().handle(() => ({ items: [1, 2, 3] }))
honoMount(agnostic)
trpcMount(agnostic)

// with no carrier there is no input verb and no vocabulary
// @ts-expect-error `.params` belongs to a carrier, not to the base
const noVerb = scope().params(postId)
// @ts-expect-error and an http word is undeclared without the carrier that coins it
const noWord = scope().handle(() => notFound())

// ── 3. exactly one carrier, BY CONSTRUCTION ──────────────────────────────────
// There is no second call to make. The shape `scope().extend(http).extend(rpc)`
// — which compiles against the shipped packages and then mounts nowhere — is
// not expressible here: `.extend` takes a Channel, and a Carrier is not one.
// @ts-expect-error a carrier is not a channel; it goes in the constructor
const twoCarriers = scope(http).extend(rpc)

// each carrier keeps its own words
const onRpc = scope(rpc).input(postId).handle(() => rpcNotFound())
trpcMount(onRpc)
// @ts-expect-error tRPC's word is not http's
const rpcWordOnHttp = scope(http).params(postId).handle(() => rpcNotFound())

// ── 3b. a channel the CARRIER cannot host, caught where it is written ────────
// Today this is a mount-time error: the scope is authored, and only the entry
// that mounts it on tRPC says no. With the carrier known at construction the
// scope itself is the wrong place for it.
// @ts-expect-error tRPC drops Set-Cookie — there is no cookie sink to add
const cookiesOnRpc = scope(rpc).extend(cookies)

// and the same channel on a carrier that admits it is unremarkable
const cookiesOnHttp = scope(http).extend(cookies)

// ── 4. the RR7 escape hatch, finally gated ───────────────────────────────────
// This is the hole measured against the shipped code: a leaf returning RR7's
// `data()` mounts on Hono today and drops the status it chose.
const rr7 = scope(reactRouter)
  .params(postId)
  .handle((ctx) => rrData({ queued: true, id: ctx.params.postId }, { status: 202 }))

// @ts-expect-error Hono cannot render React Router's own response value
const rr7OnHono = honoMount(rr7)

// and a redirect still works on both, because both coin it
const redirecting = scope(http).params(postId).handle(() => redirect('/login'))
honoMount(redirecting)
// @ts-expect-error tRPC has nowhere to redirect to
const redirectOnRpc = trpcMount(redirecting)

describe('scope(carrier) — the candidate API', () => {
  it('holds', () => {
    void withHttp; void agnostic; void noVerb; void noWord; void twoCarriers
    void onRpc; void rpcWordOnHttp; void rr7; void rr7OnHono; void redirecting
    void cookiesOnRpc; void cookiesOnHttp; void redirectOnRpc; void ABORT; void OK
  })
})
