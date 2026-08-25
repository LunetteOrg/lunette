import { describe, expect, it } from 'vitest'
import { redirect } from '../abort.ts'
import { scope } from '../scope.ts'
import { cookies, readCookies } from './cookies.ts'
import { runFold } from '../run-fold.ts'

const run = <R,>(handler: Parameters<typeof runFold>[0]) => runFold<object, R>(handler, {}, {}, {})

describe('the cookies extension', () => {
  it('collects what a leaf writes into the outcome, read back through its reader', async () => {
    const s = scope()
      .extend(cookies)
      .handle((_deps: {}, ctx) => {
        ctx.cookies.set('sid', 'abc', { httpOnly: true, path: '/' })
        return { ok: true }
      })

    const out = await run<{ ok: boolean }>(s)
    expect(readCookies(out)).toEqual([
      { name: 'sid', value: 'abc', options: { httpOnly: true, path: '/' } },
    ])
  })

  it('keeps the cookies a guard wrote before it aborted — logout drops and redirects', async () => {
    const s = scope()
      .extend(cookies)
      .guard((_deps: {}, ctx) => {
        ctx.cookies.set('session', '', { maxAge: 0 })
        return redirect('/')
      })
      .handle(() => ({ never: true }))

    const out = await run<{ never: boolean }>(s)
    expect(out.ok).toBe(false)
    expect(readCookies(out)).toEqual([{ name: 'session', value: '', options: { maxAge: 0 } }])
  })

  it('starts empty on every invocation', async () => {
    const s = scope()
      .extend(cookies)
      .handle((_deps: {}, ctx) => {
        ctx.cookies.set('n', '1')
        return { ok: true }
      })

    expect(readCookies(await run<{ ok: boolean }>(s))).toHaveLength(1)
    expect(readCookies(await run<{ ok: boolean }>(s))).toHaveLength(1)
  })

  it('reads back empty for a scope that never injected it', async () => {
    const s = scope().handle(() => ({ ok: true }))
    expect(readCookies(await run<{ ok: boolean }>(s))).toEqual([])
  })
})
