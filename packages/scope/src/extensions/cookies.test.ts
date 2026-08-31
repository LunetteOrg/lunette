import { describe, expect, it } from 'vitest'
import { http, redirect } from './http.ts'
import { scope } from '../scope.ts'
import { cookies, readCookies } from './cookies.ts'

// See `headers.test.ts` for why `Cap` stays a type parameter of `run` itself.
// The seed: everything belonging to ONE invocation. `HostCaps` is named at each
// call — it is inferable from nothing, and naming it IS the host stating what
// machinery it has (§34), so a scope needing a capability cannot be run by a
// caller that never claimed it.
const seed = { request: new Request('http://x/'), params: {} }

describe('the cookies extension', () => {
  it('collects what a leaf writes into the outcome, read back through its reader', async () => {
    const s = scope(http)
      .extend(cookies)
      .handle((_deps: {}, ctx) => {
        ctx.response.cookies.set('sid', 'abc', { httpOnly: true, path: '/' })
        return { ok: true }
      })

    const out = await s<{}, 'set-cookie'>({}, seed)
    expect(readCookies(out)).toEqual([
      { name: 'sid', value: 'abc', options: { httpOnly: true, path: '/' } },
    ])
  })

  it('keeps the cookies a guard wrote before it aborted — logout drops and redirects', async () => {
    const s = scope(http)
      .extend(cookies)
      .guard((_deps: {}, ctx) => {
        ctx.response.cookies.set('session', '', { maxAge: 0 })
        return redirect('/')
      })
      .handle(() => ({ never: true }))

    const out = await s<{}, 'set-cookie'>({}, seed)
    expect(out.ok).toBe(false)
    expect(readCookies(out)).toEqual([{ name: 'session', value: '', options: { maxAge: 0 } }])
  })

  it('starts empty on every invocation', async () => {
    const s = scope(http)
      .extend(cookies)
      .handle((_deps: {}, ctx) => {
        ctx.response.cookies.set('n', '1')
        return { ok: true }
      })

    expect(readCookies(await s<{}, 'set-cookie'>({}, seed))).toHaveLength(1)
    expect(readCookies(await s<{}, 'set-cookie'>({}, seed))).toHaveLength(1)
  })

  it('reads back empty for a scope that never injected it', async () => {
    const s = scope().handle(() => ({ ok: true }))
    expect(readCookies(await s<{}, 'set-cookie'>({}, seed))).toEqual([])
  })
})
