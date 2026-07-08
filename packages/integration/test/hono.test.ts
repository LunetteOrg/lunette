import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { chain, type Env } from './fixture/chain.ts'
import { courseHandler, loginHandler } from './fixture/handlers.ts'
import { hono, type WireEnv } from '../src/hono.ts'

describe('Hono pack — mount middleware + native chain + terminal handler', () => {
  it('runs the same handlers through a real Hono onion (native chaining)', async () => {
    type Pub = Awaited<ReturnType<typeof chain.build>>['app']
    const w = hono(chain, () => ({ env: { label: 'hono' } satisfies Env }))

    // NATIVE chaining: `.use(mount)` seeds the build; `.get/.post(path,
    // ...handler(handler))` plugs the validator + terminal into Hono's own chain,
    // so `typeof app` accumulates the route schema (this is what preserves RPC).
    const app = new Hono<WireEnv<Pub>>()
      .use(w.mount())
      .get('/courses/:courseId', ...w.handler(courseHandler))
      .post('/login', ...w.handler(loginHandler))

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

    await w.dispose()
  })
})
