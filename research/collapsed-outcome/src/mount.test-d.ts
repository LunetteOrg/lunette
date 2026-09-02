// THE DEMAND-SIDE GATE — the one the research had not touched, and the reason
// words exist at all.
//
// The supply gate asks "does this carrier coin the word this step returned?"
// and is checked where the step is WRITTEN. The demand gate asks the opposite,
// at the other end: "can the host I am mounting on render every word this scope
// can say?" — and a host that cannot must fail to COMPILE, naming the word,
// rather than degrade at runtime into a blank 500.
//
// The question here is whether a TRANSPARENT core still supports it, given that
// it has no brand and no outcome. If it does not, transparency costs the thing
// the intent axis was built for, and the trade is off.

import { scope as tbScope, mount as tbMount, type Next as TbNext, type IntentsOf as TbIntents } from './kernel-two-branch.ts'
import { scope as trScope, mount as trMount, type Next as TrNext, type IntentsOf as TrIntents } from './kernel-transparent.ts'
import {
  twoBranch, tbRefused, tbNotFound,
  transparent, trRefused, trElsewhere,
} from './carriers.ts'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

// ── the scopes: each says TWO words, `refusal` and `elsewhere` ───────────────
// (in the two-branch carrier `tbRefused`/`tbNotFound` share the name `refusal`,
// and `elsewhere` comes from its own word — see `carriers.ts`)
const tb = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }) =>
    ctx.user === 'gone' ? tbNotFound('gone') : `${ctx.user}:hello`,
  )

const tr = trScope(transparent)
  .step(async (_app: {}, ctx, next: TrNext<{ user: string }>) =>
    ctx.token === null ? trRefused('anonymous') : next({ user: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }) =>
    ctx.user === 'moved' ? trElsewhere('/here') : `${ctx.user}:hello`,
  )

// what each scope DEMANDS of a host
export const tbDemands: Equal<TbIntents<typeof tb>, 'refusal'> = true
export const trDemands: Equal<TrIntents<typeof tr>, 'refusal' | 'elsewhere'> = true

// ── the hosts ────────────────────────────────────────────────────────────────
const fullHost = {} as { readonly __renders?: { readonly refusal: true; readonly elsewhere: true } }
const partialHost = {} as { readonly __renders?: { readonly refusal: true } }
const barrenHost = {} as { readonly __renders?: {} }

// ── it holds, identically, in both ───────────────────────────────────────────
export const mountsWhereItCanBeRendered = () => {
  tbMount(fullHost, tb)
  trMount(fullHost, tr)
  // a host rendering MORE than the scope says is fine — the set is a supply
  tbMount(fullHost, tb)
}

export const refusedWhereItCannot = () => {
  // @ts-expect-error ⛔ this host cannot render the word: elsewhere
  trMount(partialHost, tr)
  // @ts-expect-error ⛔ this host cannot render the word: refusal
  tbMount(barrenHost, tb)
  // @ts-expect-error ⛔ this host cannot render the word: refusal
  trMount(barrenHost, tr)
}

// ── and a scope that says NOTHING mounts anywhere ────────────────────────────
// The agnostic case: no carrier, no words, so no host can fail to render them.
export const silentScopeMountsOnAnything = () => {
  const silent = trScope().step(async (_app: {}, _ctx: {}) => 'just a value')
  trMount(barrenHost, silent)
}
