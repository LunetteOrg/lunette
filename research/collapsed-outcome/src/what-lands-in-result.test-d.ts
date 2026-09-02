// WHAT ENDS UP IN `ResultOf` — the question that decides what a carrier must
// promise its users.
//
// The collapse puts refusals into the value channel. That is not a side effect
// of (a) or (b), it is what collapsing MEANS: with one branch there is nowhere
// else for them to go. So `ResultOf` is polluted in BOTH, and the two differ
// only in whether the payload keeps its wrapper.
//
// Which makes the real question narrower than "safe vs unsafe": (a) is safe
// WHENEVER the refusal's payload type differs from the domain type, and unsafe
// only where they coincide. (b) is safe unconditionally.

import { scope as caScope, type Next as CaNext, type ResultOf as CaResult, type Word as CaWord, word as caWord } from './kernel-collapsed-a.ts'
import { scope as tbScope, type Next as TbNext, type ResultOf as TbResult } from './kernel-two-branch.ts'
import { collapsedA, twoBranch, tbNotFound } from './carriers.ts'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Refusal = { readonly refusal: true }
type Post = { readonly id: string }

// A carrier whose refusals carry `{error}` — an API's shape, distinct from any
// domain type its users are likely to return.
const apiNotFound = (why: string): CaWord<{ readonly error: string }, Refusal> =>
  caWord({ kind: 'status', status: 404 }, { error: why })

const api = caScope(collapsedA)
  .step(async (_app: {}, ctx, next: CaNext<{ user: string }>) =>
    ctx.token === null ? apiNotFound('gone') : next({ user: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }): Promise<Post> => ({ id: ctx.user }))

// ── 1. the collapse pollutes `ResultOf`. It is not optional. ─────────────────
export const aIsPolluted: Equal<CaResult<typeof api>, Post | { readonly error: string }> = true

// TODAY, for contrast: the abort branch keeps the value channel clean.
const tb = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user: string }>) =>
    ctx.token === null ? tbNotFound('gone') : next({ user: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user: string }): Promise<Post> => ({ id: ctx.user }))

export const twoBranchStaysClean: Equal<TbResult<typeof tb>, Post> = true

// ── 2. and BECAUSE it is polluted, (a) intercepts the mistake too ────────────
// whenever the two payload types differ. Nothing about the wrapper is needed:
// a heterogeneous union is enough.
export async function readApi(app: {}, args: { token: string | null }) {
  const out = await api(app, args)
  // @ts-expect-error `Post | {error}` is not a `Post` — (a) stops it here
  const post: Post = out.value
  return post
}

// and narrowing works with ordinary code, no predicate from the carrier needed
export async function readApiCorrectly(app: {}, args: { token: string | null }) {
  const out = await api(app, args)
  if (out.value === undefined) return null
  return 'error' in out.value ? null : out.value
}
