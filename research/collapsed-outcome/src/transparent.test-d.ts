// DOES A TRANSPARENT CORE STILL HOLD ITS TWO PROMISES?
//
//   1. the gate refuses an uncoined word, and does NOT fire on plain values
//   2. the return union survives pass-through steps instead of collapsing
//
// and what does a WRAP step cost, now that `next` hands back something the type
// system declines to describe?

import { scope, type Next, type ResultOf, type ReturnsOf } from './kernel-transparent.ts'
import { transparent, trRefused, trNotFound, isTrRefusal, type TrRefusal } from './carriers.ts'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Post = { readonly id: string }

const s = scope(transparent)
  .step(async (_app: {}, ctx, next: Next<{ user: string }>) =>
    ctx.token === null ? trRefused('anonymous') : next({ user: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }): Promise<Post | TrRefusal> =>
    ctx.user === 'gone' ? trNotFound('<p>gone</p>') : { id: ctx.user },
  )

// ── 1. the return union ──────────────────────────────────────────────────────
// `Passed` is excluded, the rest survives. The scope enumerates exactly what its
// steps hand back, with no core type anywhere in it.
export const returnsSurvive: Equal<ReturnsOf<typeof s>, Post | TrRefusal> = true

// and `ResultOf` is the SAME TYPE, because the marker is excluded there too:
// where the branded designs need three projections, this kernel has one.
export const resultIsTheUnion: Equal<ResultOf<typeof s>, Post | TrRefusal> = true
export const oneProjection: Equal<ResultOf<typeof s>, ReturnsOf<typeof s>> = true

// ── 2. the gate ──────────────────────────────────────────────────────────────
const otherCarrier = {} as { readonly __vocabulary?: { readonly code: true } }

export const gateStillBites = () => {
  // @ts-expect-error ⛔ this scope does not coin the word: refusal
  scope(otherCarrier).step(async (_app: {}, _ctx: {}) => trRefused('no'))
}

// and it does NOT fire on plain domain values — the risk of reading a
// declaration off a shape rather than a brand
export const plainValuesPass = () => {
  scope(otherCarrier).step(async (_app: {}, _ctx: {}) => 'a string')
  scope(otherCarrier).step(async (_app: {}, _ctx: {}) => ({ id: 'p1' }))
  scope(otherCarrier).step(async (_app: {}, _ctx: {}) => 42)
  scope(otherCarrier).step(async (_app: {}, _ctx: {}) => null)
}

// ── 3. what a WRAP costs ─────────────────────────────────────────────────────
// A wrap that only observes is unchanged: it passes `Passed` straight through.
export const observingWrap = async (_app: {}, _ctx: {}, next: Next<{}>) => {
  const started = Date.now()
  const out = await next({})
  void started
  return out
}

// A wrap that DECORATES has to read what came back, and `Passed` says nothing.
// This is the cost of transparency, and it lands where the user said it should:
// the carrier owns the manipulation, and the carrier knows its own words.
export const carrierNormalisingWrap = async (_app: {}, _ctx: {}, next: Next<{}>) => {
  const out = (await next({})) as unknown as Post | TrRefusal
  // aligning the result to the host is ordinary code, written by whoever coined
  // the words — no core mechanism, and it IS just a step
  return isTrRefusal(out) ? { ...out, body: out.body ?? '<p>refused</p>' } : out
}
