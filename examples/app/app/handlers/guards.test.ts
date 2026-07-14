import { isAbort } from '@lntt/scope'
import type { RequestHead, RequestScope } from '@lntt/scope'
import { describe, expect, it } from 'vitest'
import type { Session } from '../domain/access.ts'
import type { PendingAuth } from '../lib/cookies.ts'
import { pendingGuard, sessionGuard, authGuard } from './guards.ts'
import { aSession } from './fixtures.ts'

// `pendingGuard` reads `ctx.request` only, but its signature declares the full
// `RequestScope`; this minimal carrier (a no-op cookie sink) satisfies it.
const carrier = (request: Request): RequestScope => ({ request, cookies: { set: () => {} } })

// The shared guards as PURE, named functions: call them with a fake dep + a bag,
// assert the enrichment or the abort. No `runScope`, no carrier, no fold — the
// fold's guard-order/short-circuit behaviour is proven once in @lntt/scope, so
// here we prove only what THIS guard computes.

describe('authGuard: the session gate every gated fragment shares', () => {
  // ONE test of the gate replaces every per-fragment "anonymous → 401" case:
  // the gate is identical wherever it sits, so it is proven once here.
  it('present session → narrows to { session }', () => {
    expect(authGuard({}, { session: aSession })).toEqual({ session: aSession })
  })

  it('null session → a returned 401 abort (the leaf never runs)', () => {
    const out = authGuard({}, { session: null })
    expect(isAbort(out)).toBe(true)
    if (isAbort(out)) expect(out.intent).toMatchObject({ kind: 'status', status: 401 })
  })
})

describe('sessionGuard: the reusable session read (anonymous-friendly)', () => {
  it('enriches { session } from getSession', async () => {
    let seen: RequestHead | null = null
    const out = await sessionGuard(
      {
        getSession: async (request: RequestHead): Promise<Session | null> => {
          seen = request
          return aSession
        },
      },
      { request: new Request('http://x') },
    )
    expect(out).toEqual({ session: aSession })
    expect(seen).not.toBeNull()
  })

  it('passes null through (no session cookie)', async () => {
    const out = await sessionGuard(
      { getSession: async (): Promise<Session | null> => null },
      { request: new Request('http://x') },
    )
    expect(out).toEqual({ session: null })
  })
})

describe('pendingGuard: gates the verify path on the pending cookie', () => {
  const pending: PendingAuth = { email: 'user@example.com', nonce: 'n1', returnTo: '/home' }

  it('cookie present → enriches { pending }', async () => {
    const out = await pendingGuard(
      { pendingCookie: { read: async (): Promise<PendingAuth | null> => pending } },
      carrier(new Request('http://x')),
    )
    expect(out).toEqual({ pending })
  })

  it('no cookie → a returned 401 abort', async () => {
    const out = await pendingGuard(
      { pendingCookie: { read: async (): Promise<PendingAuth | null> => null } },
      carrier(new Request('http://x')),
    )
    expect(isAbort(out)).toBe(true)
    if (isAbort(out)) expect(out.intent).toMatchObject({ kind: 'status', status: 401 })
  })
})
