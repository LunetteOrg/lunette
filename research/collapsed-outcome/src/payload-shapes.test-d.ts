// WHEN DOES KERNEL 2 ACTUALLY LOSE SOMETHING?
//
// `shapes.test-d.ts` shows (a) collapsing a refusal into the success type, but
// that fixture stacked the deck: its refusals were a bare string and a valueless
// word. Neither is what an API's auth guard writes — a real 401 carries a typed
// body — so this file pins the three payload shapes separately and lets each
// answer for itself.
//
// The finding is that (a)'s loss is CONDITIONAL, and the condition is legible:
// it depends on the shape of what the carrier's refusals carry, which is the
// carrier's own choice.

import { expectTypeOf } from 'vitest'
import { scope, type Next, type ResultOf, type Word, word } from './kernel-collapsed-a.ts'

const carrier = {} as {
  readonly __args?: { readonly token: string | null }
  readonly __vocabulary?: { readonly refusal: true }
}

// AN API-SHAPED refusal: it carries a typed body, like a real 401 does.
const unauthorized = (why: string): Word<{ readonly error: string }, { readonly refusal: true }> =>
  word({ kind: 'status', status: 401 }, { error: why })

// A refusal whose body is the SAME type as the success value.
const notFoundHtml = (html: string): Word<string, { readonly refusal: true }> =>
  word({ kind: 'status', status: 404 }, html)

// A refusal with genuinely NOTHING to hand back: a redirect.
const toLogin = (): Word<undefined, { readonly refusal: true }> =>
  word({ kind: 'redirect', to: '/login' })

const api = scope(carrier)
  .step(async (_app: {}, ctx, next: Next<{ user: string }>) =>
    ctx.token === null ? unauthorized('no session') : next({ user: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }) => ({ post: ctx.user }))

const html = scope(carrier)
  .step(async (_app: {}, ctx, next: Next<{ user: string }>) =>
    ctx.token === null ? notFoundHtml('<p>nope</p>') : next({ user: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }) => `<p>${ctx.user}</p>`)

const web = scope(carrier)
  .step(async (_app: {}, ctx, next: Next<{ user: string }>) =>
    ctx.token === null ? toLogin() : next({ user: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }) => `<p>${ctx.user}</p>`)

// 1. typed body, distinct from the success type → DISCRIMINABLE, (a) is fine
expectTypeOf<ResultOf<typeof api>>().toEqualTypeOf<{ post: string } | { readonly error: string }>()

// 2. body of the SAME type as the success → collapsed, information gone
expectTypeOf<ResultOf<typeof html>>().toEqualTypeOf<string>()

// 3. genuinely valueless (a redirect) → the nullable
expectTypeOf<ResultOf<typeof web>>().toEqualTypeOf<string | undefined>()
