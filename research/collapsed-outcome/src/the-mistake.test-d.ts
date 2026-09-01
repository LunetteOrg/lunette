// THE MISTAKE, written against both — is it refused, and by WHAT?
//
// The scope below serves HTML and refuses with HTML: success and refusal are the
// same type, which is the condition under which (a) is lossy at all (see
// `payload-shapes.test-d.ts`). rr7's loaders are shaped exactly like this.

import { scope as caScope, type Next as CaNext } from './kernel-collapsed-a.ts'
import { scope as cbScope, type Next as CbNext, isWord } from './kernel-collapsed-b.ts'
import { collapsedA, caNotFound, collapsedB, cbNotFound } from './carriers.ts'

const ca = caScope(collapsedA)
  .step(async (_app: {}, ctx, next: CaNext<{ user: string }>) =>
    ctx.token === null ? caNotFound('<p>gone</p>') : next({ user: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }) => `<p>${ctx.user}</p>`)

const cb = cbScope(collapsedB)
  .step(async (_app: {}, ctx, next: CbNext<{ user: string }>) =>
    ctx.token === null ? cbNotFound('<p>gone</p>') : next({ user: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }) => `<p>${ctx.user}</p>`)

// ── (a): the mistake COMPILES ────────────────────────────────────────────────
export async function renderA(app: {}, args: { token: string | null }) {
  const out = await ca(app, args)
  // No narrowing, no error, no warning. When the scope REFUSED, this renders
  // the 404's body as though it were the page — and the caller never learns.
  const page: string = out.value ?? ''
  return page
}

// ── (b): the same mistake is REFUSED ─────────────────────────────────────────
export async function renderB(app: {}, args: { token: string | null }) {
  const out = await cb(app, args)
  // @ts-expect-error the refusal is in the way: `string | Word<…>` is not a `string`
  const page: string = out.result
  return page
}

// ── and what makes (b) refuse it is the WRAPPER, not the symbol ──────────────
// The symbol brands the word so `isWord` is trustworthy AT RUNTIME. What stops
// the mistake at COMPILE time is that a word is an object wrapping the body,
// never the body itself — so the union is heterogeneous and TypeScript will not
// let one stand for the other. A plain `typeof` narrows it just as well:
export async function narrowedWithoutTheSymbol(app: {}, args: { token: string | null }) {
  const out = await cb(app, args)
  const page: string = typeof out.result === 'string' ? out.result : '<p>nothing</p>'
  return page
}

export async function narrowedWithTheSymbol(app: {}, args: { token: string | null }) {
  const out = await cb(app, args)
  // and this one also reaches the refusal's own body and its intent
  return isWord(out.result) ? { body: out.result.value, refused: true } : { body: out.result, refused: false }
}

// ── the honest limit of (b) ──────────────────────────────────────────────────
// A cast defeats it, as a cast defeats everything. (b) makes the mistake
// deliberate; it does not make it impossible.
export async function castsStillWin(app: {}, args: { token: string | null }) {
  const out = await cb(app, args)
  return out.result as string
}
