// DOES THE VISIBILITY PROJECTION SURVIVE THE COLLAPSE?
//
// `shapes.test-d.ts` measures `ResultOf` — what a scope YIELDS — and that is
// where kernel 2 loses the distinction between a refusal's body and a success.
// But "what can this scope hand back?" is a different question, and it is
// answered by a different projection: `ReturnsOf` reads the RAW union the state
// accumulated, before `ValueOf` is applied at all.
//
// If that projection is equally informative in the three kernels, then losing
// the distinction in `ResultOf` costs LESS than it appears — the information is
// still there, one type away, in every design.

import { scope as tbScope, type Next as TbNext, type ReturnsOf as TbReturns } from './kernel-two-branch.ts'
import { scope as caScope, type Next as CaNext, type ReturnsOf as CaReturns, type Word as CaWord } from './kernel-collapsed-a.ts'
import { scope as cbScope, type Next as CbNext, type ReturnsOf as CbReturns, type Word as CbWord } from './kernel-collapsed-b.ts'
import type { Abort as TbAbort, Ok as TbOk } from './kernel-two-branch.ts'
import {
  twoBranch, tbRefused, tbNotFound,
  collapsedA, caRefused, caNotFound,
  collapsedB, cbRefused, cbNotFound,
} from './carriers.ts'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false

type Refusal = { readonly refusal: true }

// The same scope on the three, as everywhere else in this prototype.
const tb = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }) =>
    ctx.user === 'gone' ? tbNotFound('no such note') : `${ctx.user}:hello`,
  )

const ca = caScope(collapsedA)
  .step(async (_app: {}, ctx, next: CaNext<{ user: string }>) =>
    ctx.token === null ? caRefused('anonymous') : next({ user: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }) =>
    ctx.user === 'gone' ? caNotFound('no such note') : `${ctx.user}:hello`,
  )

const cb = cbScope(collapsedB)
  .step(async (_app: {}, ctx, next: CbNext<{ user: string }>) =>
    ctx.token === null ? cbRefused('anonymous') : next({ user: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }) =>
    ctx.user === 'gone' ? cbNotFound('no such note') : `${ctx.user}:hello`,
  )

// ── and the answer is: yes, identically informative in all three ─────────────
// Every step's return type is there, named and separate, INCLUDING in kernel 2
// where `ResultOf` merged the 404 body into the success `string`. The merge
// happens in `ValueOf`, which this projection never applies.

export const tbSeesEverything: Equal<
  TbReturns<typeof tb>,
  string | TbAbort<Refusal>
> = true

export const caSeesEverything: Equal<
  CaReturns<typeof ca>,
  string | CaWord<undefined, Refusal> | CaWord<string, Refusal>
> = true

export const cbSeesEverything: Equal<
  CbReturns<typeof cb>,
  string | CbWord<undefined, Refusal> | CbWord<string, Refusal>
> = true

// A note on the first: the two-branch kernel's two refusals COLLAPSE into one
// constituent, because `Abort<I>` carries only the intent NAME and both words
// share `refusal`. So the design that keeps the branches is the one that shows
// LESS here — the collapsed kernels distinguish the valueless refusal from the
// one carrying a body, and today's does not.
export const tbIsTheLossyOne: Equal<TbReturns<typeof tb>, string | TbAbort<Refusal>> = true

// unused-import guard: `TbOk` documents the other half of today's word pair
export type _TbOk = TbOk<string>
