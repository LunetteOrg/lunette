import { describe, expect, it } from 'vitest'
import { scope as tbScope, type Next as TbNext } from './kernel-two-branch.ts'
import { scope as caScope, type Next as CaNext } from './kernel-collapsed-a.ts'
import { scope as cbScope, type Next as CbNext, isWord } from './kernel-collapsed-b.ts'
import {
  twoBranch, tbRefused, tbNotFound,
  collapsedA, caRefused, caNotFound,
  collapsedB, cbRefused, cbNotFound,
} from './carriers.ts'

// The three kernels run the SAME three cases. Nothing about behaviour is at
// stake here — the finding is what a CALLER has to write to read the answer,
// which the assertions below are.

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

describe('kernel 1 — two branches', () => {
  it('asks `ok` first, and the body of a refusal lives inside the intent', async () => {
    expect(await tb({}, { token: 'u1' })).toMatchObject({ ok: true, value: 'u1:hello' })
    expect(await tb({}, { token: null })).toMatchObject({
      ok: false,
      intent: { kind: 'refused', why: 'anonymous' },
    })
    // the 404's body is NOT a value — it is a field of the intent, which is the
    // only place the two-branch shape has for it
    expect(await tb({}, { token: 'gone' })).toMatchObject({
      ok: false,
      intent: { kind: 'not-found', body: 'no such note' },
    })
  })
})

describe('kernel 2 — collapsed, R carries the payload', () => {
  it('hands back one shape, and the 404 body is an ordinary value', async () => {
    expect(await ca({}, { token: 'u1' })).toMatchObject({ value: 'u1:hello' })
    // a refusal with nothing to hand back: an intent and NO value
    const refused = await ca({}, { token: null })
    expect(refused).toMatchObject({ intent: { kind: 'refused', why: 'anonymous' } })
    expect('value' in refused).toBe(false)
    // and the 404 carries its body exactly as the 200 carries its own
    expect(await ca({}, { token: 'gone' })).toMatchObject({
      intent: { kind: 'not-found' },
      value: 'no such note',
    })
  })

  it('leaves the caller nothing to discriminate on but the intent it cannot type', async () => {
    // Both are `string | undefined` to the type system. Telling them apart at
    // runtime means reading `intent`, which is `unknown` — so the caller either
    // trusts the carrier's documentation or asks the carrier for a predicate.
    const served = await ca({}, { token: 'u1' })
    const gone = await ca({}, { token: 'gone' })
    expect(typeof served.value).toBe('string')
    expect(typeof gone.value).toBe('string')
  })
})

describe('kernel 3 — collapsed, R carries the word', () => {
  it('hands back the word itself, so the caller discriminates on a type it has', async () => {
    expect(await cb({}, { token: 'u1' })).toMatchObject({ result: 'u1:hello' })

    const refused = await cb({}, { token: null })
    expect(isWord(refused.result)).toBe(true)

    const gone = await cb({}, { token: 'gone' })
    expect(isWord(gone.result)).toBe(true)
    // the body rode the word, not the intent
    expect(isWord(gone.result) && gone.result.value).toBe('no such note')

    // and a plain domain value is NOT a word, which is the discrimination the
    // other kernel had to go outside the type system for
    const served = await cb({}, { token: 'u1' })
    expect(isWord(served.result)).toBe(false)
  })
})

describe('all three', () => {
  it('throw on a scope with no leaf — the collapse does not touch that branch', async () => {
    await expect(tbScope(twoBranch)({}, { token: 'u1' })).rejects.toThrow(/no leaf|passed through/)
    await expect(caScope(collapsedA)({}, { token: 'u1' })).rejects.toThrow(/passed through/)
    await expect(cbScope(collapsedB)({}, { token: 'u1' })).rejects.toThrow(/passed through/)
  })
})
