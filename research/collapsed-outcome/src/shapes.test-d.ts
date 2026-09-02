import { expectTypeOf } from 'vitest'
import { scope as tbScope, type Next as TbNext, type ResultOf as TbResult } from './kernel-two-branch.ts'
import {
  scope as caScope,
  type Next as CaNext,
  type ResultOf as CaResult,
  type Word as CaWord,
} from './kernel-collapsed-a.ts'
import {
  scope as cbScope,
  type Next as CbNext,
  type ResultOf as CbResult,
  type Word as CbWord,
} from './kernel-collapsed-b.ts'
import {
  twoBranch, tbRefused, tbNotFound,
  collapsedA, caRefused, caNotFound,
  collapsedB, cbRefused, cbNotFound,
} from './carriers.ts'

// THE SAME SCOPE, three times. A guard that may refuse with nothing to hand
// back, and a leaf that either produces a string or refuses WITH A STRING BODY.
// Nothing else differs — so what `R` becomes is caused by the outcome shape and
// by nothing else.

// ── kernel 1: today ──────────────────────────────────────────────────────────
const tb = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user: 'u1' }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }) =>
    ctx.user === 'gone' ? tbNotFound('no such note') : `${ctx.user}:hello`,
  )

// The refusals contribute NOTHING. `R` is the domain side, and it is exactly the
// type the leaf produces when it produces.
expectTypeOf<TbResult<typeof tb>>().toEqualTypeOf<string>()

// ── kernel 2: collapsed, R carries the payload ───────────────────────────────
const ca = caScope(collapsedA)
  .step(async (_app: {}, ctx, next: CaNext<{ user: string }>) =>
    ctx.token === null ? caRefused('anonymous') : next({ user: 'u1' }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }) =>
    ctx.user === 'gone' ? caNotFound('no such note') : `${ctx.user}:hello`,
  )

// TWO losses, and only the first was predicted.
//
// `notFound('no such note')` unwraps to `string` — the same `string` the happy
// leaf produces — so the 404 body and the 200 body are one type and nothing
// distinguishes them.
//
// And the guard's VALUELESS refusal unwraps to `undefined`, so `R` picks up a
// nullable it never had. A caller reading the result cannot tell "the scope
// refused" from "the leaf produced undefined".
expectTypeOf<CaResult<typeof ca>>().toEqualTypeOf<string | undefined>()

// The fix for the second loss is to send a word with no value to `never` — at
// which point `ValueOf` has re-grown the rule the `abort` branch WAS. Pinned so
// the convergence is evidence and not a remark.
type RefinedValueOf<R> = R extends CaWord<infer V, any> ? ([V] extends [undefined] ? never : V) : R
expectTypeOf<RefinedValueOf<string | ReturnType<typeof caRefused> | ReturnType<typeof caNotFound>>>()
  .toEqualTypeOf<string>()

// ── kernel 3: collapsed, R carries the word ──────────────────────────────────
const cb = cbScope(collapsedB)
  .step(async (_app: {}, ctx, next: CbNext<{ user: string }>) =>
    ctx.token === null ? cbRefused('anonymous') : next({ user: 'u1' }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }) =>
    ctx.user === 'gone' ? cbNotFound('no such note') : `${ctx.user}:hello`,
  )

// Every refusal the scope can produce is READABLE OFF ITS TYPE, and the words
// keep their intent names, so they discriminate without the carrier tagging
// anything by hand. This is what "for each scope we know all the possible
// errors" costs and buys.
expectTypeOf<CbResult<typeof cb>>().toEqualTypeOf<
  | string
  | CbWord<undefined, { readonly refusal: true }>
  | CbWord<string, { readonly refusal: true }>
>()

// ── the gate is untouched by the collapse ────────────────────────────────────
// A word the carrier does not coin is refused where the step is written, in all
// three. The machinery reads intent NAMES and never the branch, which is why
// collapsing the branches costs the vocabulary nothing.
const otherCarrier = {} as { readonly __vocabulary?: { readonly code: true } }

export const gateStillBites = () => {
  // @ts-expect-error ⛔ this scope does not coin the word: refusal
  cbScope(otherCarrier).step(async (_app: {}, _ctx: {}) => cbRefused('no'))
  // @ts-expect-error ⛔ this scope does not coin the word: refusal
  caScope(otherCarrier).step(async (_app: {}, _ctx: {}) => caRefused('no'))
  // @ts-expect-error ⛔ this scope does not coin the word: refusal
  tbScope(otherCarrier).step(async (_app: {}, _ctx: {}) => tbRefused('no'))
}
