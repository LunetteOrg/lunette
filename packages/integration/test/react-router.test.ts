import { describe, expect, it } from 'vitest'
import { chain, type Env } from './fixture/chain.ts'
import { courseHandler } from './fixture/handlers.ts'
import { reactRouter } from '../src/react-router.ts'

const bearer = (u: string) =>
  new Request('http://x/', { headers: { authorization: `Bearer ${u}` } })

// The pack takes the CHAIN and owns build-once; seedFrom maps the host env to
// the chain's Seed. mount seeds the memoized build and returns the load context.
const pack = reactRouter(chain, (env) => ({ env: env as Env }))

describe('React Router 7 pack — mount + real loader invocation', () => {
  it('owner → 200 with the prefetched course', async () => {
    const context = await pack.mount({ label: 'rr7' })
    const res = await pack.toLoader(courseHandler)({
      request: bearer('u-admin'),
      params: { courseId: 'c1' },
      context,
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'c1', title: 'Owned by admin' })
  })

  it('non-owner → 403, the leaf never runs', async () => {
    const context = await pack.mount({ label: 'rr7' })
    const res = await pack.toLoader(courseHandler)({
      request: bearer('u-admin'),
      params: { courseId: 'c2' },
      context,
    })
    expect(res.status).toBe(403)
  })

  it('anonymous → 401', async () => {
    const context = await pack.mount({ label: 'rr7' })
    const res = await pack.toLoader(courseHandler)({
      request: new Request('http://x/'),
      params: { courseId: 'c1' },
      context,
    })
    expect(res.status).toBe(401)
  })

  it('mount builds once per isolate, dispose tears down', async () => {
    const a = await pack.mount({ label: 'rr7' })
    const b = await pack.mount({ label: 'ignored' })
    // first-seed-wins memo: the same app instance is handed back
    expect(a.__wireApp).toBe(b.__wireApp)
    await pack.dispose()
  })
})
