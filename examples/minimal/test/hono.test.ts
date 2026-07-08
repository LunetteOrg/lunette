import { describe, expect, it } from 'vitest'
import { app, dispose } from '../src/hono.ts'

describe('Hono host — the shared fragment through a real Hono onion', () => {
  it('owner → 200, non-owner → 403, anon → 401, login → 302 + cookie', async () => {
    const auth = { headers: { authorization: 'Bearer u-admin' } }

    const ok = await app.request('/courses/c1', auth)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ id: 'c1', title: 'Owned by admin' })

    const forbidden = await app.request('/courses/c2', auth)
    expect(forbidden.status).toBe(403)

    const anon = await app.request('/courses/c1')
    expect(anon.status).toBe(401)

    // cookie sink + redirect abort survive the codec
    const login = await app.request('/login', { method: 'POST' })
    expect(login.status).toBe(302)
    expect(login.headers.get('location')).toBe('/dashboard')
    expect(login.headers.get('set-cookie')).toContain('sid=u-admin')
    expect(login.headers.get('set-cookie')).toContain('HttpOnly')

    await dispose()
  })
})
