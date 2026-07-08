import { afterAll, describe, expect, it } from 'vitest'
import { parseEnv } from '../config/env.ts'
import { feedLoader, loginAction, pack, postLoader } from './scoped-routes.ts'

// The AFTER, exercised through the REAL chain (memory db, logging mailer). The
// contrast with routes.ts + react-router.test.ts: no loader re-reads the
// session, the 404 is a returned abort, and the deps check happened at compile
// time (this file would not typecheck if a fragment reached for a hidden repo).
const env = parseEnv({})

describe('scoped routes (after): the per-request session/guard collapses', () => {
  afterAll(async () => {
    await pack.dispose()
  })

  it('feed loader: fresh db → empty feed, not signed in', async () => {
    const context = await pack.mount(env)
    const res = await feedLoader({ request: new Request('http://x'), params: {}, context })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ signedIn: false, feed: [] })
  })

  it('post loader: unknown id → notFound() abort → 404, leaf never runs', async () => {
    const context = await pack.mount(env)
    const res = await postLoader({
      request: new Request('http://x'),
      params: { postId: 'does-not-exist' },
      context,
    })
    expect(res.status).toBe(404)
  })

  it('login action: invalid email → 422 domain body, requestCode never runs', async () => {
    const context = await pack.mount(env)
    const form = new FormData()
    form.set('email', 'not-an-email')
    const res = await loginAction({
      request: new Request('http://x', { method: 'POST', body: form }),
      params: {},
      context,
    })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'invalid-email' })
  })

  it('login action: valid email → requestCode runs → 200 ok', async () => {
    const context = await pack.mount(env)
    const form = new FormData()
    form.set('email', 'user@example.com')
    const res = await loginAction({
      request: new Request('http://x', { method: 'POST', body: form }),
      params: {},
      context,
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('mount builds once per isolate: the same app instance is handed back', async () => {
    const a = await pack.mount(env)
    const b = await pack.mount(env)
    expect(a.__wireApp).toBe(b.__wireApp)
  })
})
