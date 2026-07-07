import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { chain } from '../chain.ts'
import { makeHandlers } from '../example.ts'
import { toHono } from './hono.ts'

describe('Hono adapter — real app.request dispatch', () => {
  it('runs the same handlers through a real Hono onion', async () => {
    const { app: pub, dispose } = await chain.build({ env: { label: 'hono' } })
    const handlers = makeHandlers(pub)

    const app = new Hono()
    app.get('/courses/:courseId', toHono(handlers.course))
    app.post('/login', toHono(handlers.login))

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
