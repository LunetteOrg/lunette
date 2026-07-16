import { describe, expect, it } from 'vitest'
import { scope } from '../scope.ts'
import { runFold } from '../run-fold.ts'
import type { RequestCarrier } from '../carrier.ts'
import { cookies } from './cookies.ts'

describe('cookies — runtime sink', () => {
  it('collects Set-Cookie into the Outcome without changing the leaf return', async () => {
    const handler = scope()
      .extend(cookies)
      .handle((_d: {}, ctx) => {
        ctx.cookies.set('sid', 'abc', { httpOnly: true })
        return { ok: true }
      })
    const out = await runFold<RequestCarrier, { ok: boolean }>(
      handler,
      {},
      { request: new Request('http://x/') },
      {},
    )
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.value).toEqual({ ok: true })
    expect(out.cookies).toEqual([{ name: 'sid', value: 'abc', options: { httpOnly: true } }])
  })
})
