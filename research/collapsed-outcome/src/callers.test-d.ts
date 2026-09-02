// (a) VS (b), SIDE BY SIDE — the same three jobs, written against each.
//
// The carrier author's half is missing from this file ON PURPOSE: it is
// IDENTICAL in the two (see `carriers.ts`, where `caNotFound` and `cbNotFound`
// differ only in which module they import). Everything that separates the two
// designs is here, downstream.

import { scope as caScope, type Next as CaNext, type ResultOf as CaResult, type ReturnsOf as CaReturns, type Word as CaWord } from './kernel-collapsed-a.ts'
import { scope as cbScope, type Next as CbNext, type ResultOf as CbResult, type ReturnsOf as CbReturns, type Word as CbWord, isWord } from './kernel-collapsed-b.ts'
import { collapsedA, caRefused, caNotFound, collapsedB, cbRefused, cbNotFound } from './carriers.ts'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Refusal = { readonly refusal: true }

const ca = caScope(collapsedA)
  .step(async (_app: {}, ctx, next: CaNext<{ user: string }>) =>
    ctx.token === null ? caRefused('anonymous') : next({ user: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }) =>
    ctx.user === 'gone' ? caNotFound('<p>gone</p>') : `<p>${ctx.user}</p>`,
  )

const cb = cbScope(collapsedB)
  .step(async (_app: {}, ctx, next: CbNext<{ user: string }>) =>
    ctx.token === null ? cbRefused('anonymous') : next({ user: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }) =>
    ctx.user === 'gone' ? cbNotFound('<p>gone</p>') : `<p>${ctx.user}</p>`,
  )

// ── 1. WHAT THE SCOPE DECLARES ───────────────────────────────────────────────
// (a) merges the refusal body into the success and adds a nullable.
export const aResult: Equal<CaResult<typeof ca>, string | undefined> = true
// (b) keeps every constituent, and the word's name rides along.
export const bResult: Equal<
  CbResult<typeof cb>,
  string | CbWord<undefined, Refusal> | CbWord<string, Refusal>
> = true

// The visibility projection is EQUALLY informative in both — this is the axis
// the two do NOT differ on.
export const aReturns: Equal<
  CaReturns<typeof ca>,
  string | CaWord<undefined, Refusal> | CaWord<string, Refusal>
> = true
export const bReturns: Equal<
  CbReturns<typeof cb>,
  string | CbWord<undefined, Refusal> | CbWord<string, Refusal>
> = true

// ── 2. A MOUNT, rendering whatever came back ─────────────────────────────────
export async function mountA(app: {}, args: { token: string | null }) {
  const out = await ca(app, args)
  // The word is GONE by now: `intent` is the only trace, and it is `unknown`.
  // Reading it means trusting the carrier's documentation, or asking the
  // carrier for a predicate this kernel does not have.
  const body: string | undefined = out.value
  const intent: unknown = out.intent
  return { body, intent }
}

export async function mountB(app: {}, args: { token: string | null }) {
  const out = await cb(app, args)
  // The word is still there, and narrowing it is ordinary code.
  if (isWord(out.result)) return { body: out.result.value, intent: out.result.intent }
  return { body: out.result, intent: undefined }
}

// ── 3. A PROGRAMMATIC CALLER that only wants the domain value ────────────────
export async function readA(app: {}, args: { token: string | null }) {
  const out = await ca(app, args)
  // Nothing to narrow ON. `undefined` means "refused with no body" OR "refused
  // with an undefined body" OR nothing at all — and a 404's HTML is the same
  // `string` as a 200's. The caller cannot tell, and gets no warning.
  return out.value ?? '<p>nothing</p>'
}

export async function readB(app: {}, args: { token: string | null }) {
  const out = await cb(app, args)
  // The refusal is IN THE WAY, which is the point: it cannot be used as a
  // domain value by accident.
  return isWord(out.result) ? '<p>nothing</p>' : out.result
}
