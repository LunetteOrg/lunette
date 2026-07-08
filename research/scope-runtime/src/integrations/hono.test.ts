import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { chain, type Env } from '../chain.ts'
import { courseHandler, loginHandler } from '../example.ts'
import { hono, type WireEnv } from './hono.ts'

describe('Hono pack — mount middleware + registrar dispatch', () => {
  it('runs the same handlers through a real Hono onion', async () => {
    type Pub = Awaited<ReturnType<typeof chain.build>>['app']
    const pack = hono(chain, () => ({ env: { label: 'hono' } satisfies Env }))

    const app = new Hono<WireEnv<Pub>>()
    // mount is registered ONCE; it seeds the build and stashes the app on ctx.
    app.use('*', pack.mount())
    pack
      .route(app)
      .get('/courses/:courseId', courseHandler)
      .post('/login', loginHandler)

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

    await pack.dispose()
  })
})
