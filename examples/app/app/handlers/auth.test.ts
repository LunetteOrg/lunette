import { isAbort, runScope } from '@lntt/scope'
import type { RequestCarrier } from '@lntt/scope'
import { readCookies, type CookieSink, type SetCookie } from '@lntt/scope/cookies'
import { describe, expect, it } from 'vitest'
import type { PendingAuth } from '../lib/cookies.ts'
import { OtpInvalid } from '../lib/errors.ts'
import type { VerifyCodeResult } from '../use-cases/access/verify-code.ts'
import { loginGuard, verifyHandler } from './auth.ts'
import { verifyScope } from '../handlers.ts'
import { jsonPost } from './fixtures.ts'

// The auth handlers as PURE functions plus — for `verify` alone — the thinner
// `runScope` INTEGRATION check. The verify fold interaction is scope-specific
// (abort mapping + session cookie set + pending cookie dropped + redirect, all
// in ONE fold), so it is proven end-to-end here as well as per pure leaf. The
// generic fold mechanics stay proven once in @lntt/scope.

// A cookie sink that records every `.set` — the pure tests read it back to prove
// which cookies a guard/leaf wrote through it.
const collectCookies = (): { cookies: SetCookie[]; sink: CookieSink } => {
  const cookies: SetCookie[] = []
  return {
    cookies,
    sink: { set: (name, value, options = {}) => cookies.push({ name, value, options }) },
  }
}

// A fake pending cookie whose `apply` writes a signed value through the sink.
const pendingCookie = {
  apply: (sink: CookieSink, value: PendingAuth): void =>
    sink.set('pending-auth', `signed:${value.email}:${value.nonce}`, {
      path: '/',
      httpOnly: true,
      maxAge: 900,
    }),
}

describe('loginGuard: valid → code + pending cookie, invalid → 422', () => {
  it('valid email → requestCode runs with a nonce, pending cookie applied', async () => {
    const called: Array<{ email: string; nonce: string | undefined }> = []
    const { cookies, sink } = collectCookies()
    const out = await loginGuard(
      {
        validateEmail: (email: string): boolean => email.includes('@'),
        generateId: (): string => 'nonce-1',
        access: {
          requestCode: async (email: string, nonce?: string): Promise<void> => {
            called.push({ email, nonce })
          },
        },
        pendingCookie,
      },
      { form: { email: 'user@example.com' }, cookies: sink },
    )
    expect(isAbort(out)).toBe(false)
    expect(called).toEqual([{ email: 'user@example.com', nonce: 'nonce-1' }])
    expect(cookies).toEqual([
      {
        name: 'pending-auth',
        value: 'signed:user@example.com:nonce-1',
        options: { path: '/', httpOnly: true, maxAge: 900 },
      },
    ])
  })

  it('invalid email → 422 abort, requestCode never runs, no cookie', async () => {
    const called: string[] = []
    const { cookies, sink } = collectCookies()
    const out = await loginGuard(
      {
        validateEmail: (email: string): boolean => email.includes('@'),
        generateId: (): string => 'nonce-1',
        access: {
          requestCode: async (email: string): Promise<void> => {
            called.push(email)
          },
        },
        pendingCookie,
      },
      { form: { email: 'not-an-email' }, cookies: sink },
    )
    expect(isAbort(out)).toBe(true)
    if (isAbort(out))
      expect(out.intent).toMatchObject({ kind: 'status', status: 422, body: { error: 'invalid-email' } })
    expect(called).toEqual([])
    expect(cookies).toEqual([])
  })
})

describe('verifyHandler: wrong code → 401, ok → session set + pending dropped + redirect', () => {
  const pending: PendingAuth = { email: 'user@example.com', nonce: 'n1', returnTo: '/home' }

  it('wrong code → the returned OtpInvalid maps to 401, no cookies set', async () => {
    const { cookies, sink } = collectCookies()
    const out = await verifyHandler(
      {
        access: { verifyCode: async (): Promise<VerifyCodeResult | OtpInvalid> => new OtpInvalid() },
        sessionCookie: { apply: (): void => {} },
        pendingCookie: { drop: (): void => {} },
      },
      { pending, body: { code: 'wrong' }, cookies: sink },
    )
    expect(out.intent).toMatchObject({ kind: 'status', status: 401, body: { error: 'OtpInvalid' } })
    expect(cookies).toEqual([])
  })

  it('ok → session cookie set, pending dropped, redirect to returnTo', async () => {
    const { cookies, sink } = collectCookies()
    const out = await verifyHandler(
      {
        access: {
          verifyCode: async (email: string, code: string, nonce?: string): Promise<VerifyCodeResult> => {
            expect(email).toBe('user@example.com')
            expect(nonce).toBe('n1')
            expect(code).toBe('123456')
            return { sessionId: 's1', userId: 'u1', isNewUser: true, locale: null }
          },
        },
        sessionCookie: {
          apply: (s: CookieSink, id: string): void =>
            s.set('session', `signed:${id}`, { path: '/', httpOnly: true, maxAge: 60 }),
        },
        pendingCookie: { drop: (s: CookieSink): void => s.set('pending-auth', '', { path: '/', maxAge: 0 }) },
      },
      { pending, body: { code: '123456' }, cookies: sink },
    )
    expect(out.intent).toMatchObject({ kind: 'redirect', location: '/home' })
    expect(cookies).toEqual([
      { name: 'session', value: 'signed:s1', options: { path: '/', httpOnly: true, maxAge: 60 } },
      { name: 'pending-auth', value: '', options: { path: '/', maxAge: 0 } },
    ])
  })
})

// KEPT at the `runScope` level: verify's fold interaction is scope-specific
// (the pending gate short-circuits before the leaf; the leaf's cookie writes and
// redirect ride the outcome). These prove the WIRING, complementing the pure
// `verifyHandler` tests above.
describe('verifyScope: no pending → 401, wrong code → 401, ok → redirect + cookies', () => {
  const pending: PendingAuth = { email: 'user@example.com', nonce: 'n1', returnTo: '/home' }

  it('no pending cookie → 401, verifyCode never runs', async () => {
    let ran = false
    const app = {
      pendingCookie: { read: async (): Promise<PendingAuth | null> => null },
      access: {
        verifyCode: async (): Promise<VerifyCodeResult> => {
          ran = true
          return { sessionId: 's1', userId: 'u1', isNewUser: false, locale: null }
        },
      },
      sessionCookie: { apply: (): void => {} },
    }
    const out = await runScope<RequestCarrier, typeof verifyScope.schema, never>(
      verifyScope,
      app,
      jsonPost({ code: '123456' }),
      {},
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.abort.intent).toMatchObject({ kind: 'status', status: 401 })
    expect(ran).toBe(false)
  })

  it('wrong code → returned OtpInvalid maps to 401, no cookies set', async () => {
    const app = {
      pendingCookie: { read: async (): Promise<PendingAuth | null> => pending, drop: (): void => {} },
      access: { verifyCode: async (): Promise<VerifyCodeResult | OtpInvalid> => new OtpInvalid() },
      sessionCookie: { apply: (): void => {} },
    }
    const out = await runScope<RequestCarrier, typeof verifyScope.schema, never>(
      verifyScope,
      app,
      jsonPost({ code: 'wrong' }),
      {},
    )
    expect(out.ok).toBe(false)
    if (!out.ok)
      expect(out.abort.intent).toMatchObject({ kind: 'status', status: 401, body: { error: 'OtpInvalid' } })
    expect(readCookies(out)).toEqual([])
  })

  it('ok → session cookie set, pending dropped, redirect to returnTo', async () => {
    const app = {
      pendingCookie: {
        read: async (): Promise<PendingAuth | null> => pending,
        drop: (sink: CookieSink): void => sink.set('pending-auth', '', { path: '/', maxAge: 0 }),
      },
      access: {
        verifyCode: async (email: string, code: string, nonce?: string): Promise<VerifyCodeResult> => {
          expect(email).toBe('user@example.com')
          expect(nonce).toBe('n1')
          expect(code).toBe('123456')
          return { sessionId: 's1', userId: 'u1', isNewUser: true, locale: null }
        },
      },
      sessionCookie: {
        apply: (sink: CookieSink, id: string): void =>
          sink.set('session', `signed:${id}`, { path: '/', httpOnly: true, maxAge: 60 }),
      },
    }
    const out = await runScope<RequestCarrier, typeof verifyScope.schema, never>(
      verifyScope,
      app,
      jsonPost({ code: '123456' }),
      {},
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.abort.intent).toMatchObject({ kind: 'redirect', location: '/home' })
    expect(readCookies(out)).toEqual([
      { name: 'session', value: 'signed:s1', options: { path: '/', httpOnly: true, maxAge: 60 } },
      { name: 'pending-auth', value: '', options: { path: '/', maxAge: 0 } },
    ])
  })
})
