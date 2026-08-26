import type { PubOf } from '@lntt/wire'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { chain, type Env } from './fixture/chain.ts'
import { courseHandler, loginHandler } from './fixture/handlers.ts'
import { hono, type WireEnv } from '../src/hono.ts'

describe('Hono pack — mount middleware + native chain + terminal handler', () => {
  it('runs the same handlers through a real Hono onion (native chaining)', async () => {
    type Pub = PubOf<typeof chain>
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

// What `seedFrom`'s PARAMETER actually receives. The signature is
// `(hostEnv: unknown) => Seed` and exists for one reason — on Workers, Hono
// hands the bindings over per request as `c.env` — but until now nothing in the
// repo asserted that a value reaches it. Both the React Router pack's tests and
// the Workers example exercise the SHAPE while supplying the env from elsewhere,
// so the delivery itself was only ever verified by reading the pack.
//
// This is the whole claim, and it is one line of the pack: `hono.ts` calls
// `seedFrom(c.env)`. Asserted here rather than in an example, because from
// outside a worker `c.env` and `import { env } from 'cloudflare:workers'` are the
// SAME object — no response can tell you which one a seed read.
describe('the host env reaches seedFrom', () => {
  it('receives the Hono context env, and only on the build that happens', async () => {
    const received: unknown[] = []
    const w = hono(chain, (hostEnv) => {
      received.push(hostEnv)
      return { env: { label: 'from-host' } satisfies Env }
    })
    const app = new Hono().get('/courses/:courseId', ...w.handler(courseHandler))

    // Hono's `Bindings` are what `c.env` carries; `app.request`'s third argument
    // is how they are supplied outside a Worker.
    const bindings = { LABEL: 'delivered', TOKEN: 's3cret' }
    const res = await app.request('/courses/c1', { headers: { authorization: 'Bearer u-admin' } }, bindings)
    expect(res.status).toBe(200)

    expect(received).toEqual([bindings])

    // The seed is a thunk `ensure` evaluates once (§36), so a second request with
    // DIFFERENT bindings does not reach `seedFrom` at all. That is the property
    // the signature's name obscures: it is not a per-request seed.
    await app.request('/courses/c1', { headers: { authorization: 'Bearer u-admin' } }, { LABEL: 'ignored' })
    expect(received).toEqual([bindings])

    await w.dispose()
  })
})
