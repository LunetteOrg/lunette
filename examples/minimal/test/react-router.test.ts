import { describe, expect, it } from 'vitest'
import { courseLoader, dispose, mount } from '../src/react-router.ts'

const bearer = (u: string) =>
  new Request('http://x/', { headers: { authorization: `Bearer ${u}` } })

describe('React Router 7 host — the shared fragment as a real loader', () => {
  it('owner → 200 with the prefetched course', async () => {
    const context = await mount({ label: 'rr7' })
    const res = await courseLoader({
      request: bearer('u-admin'),
      params: { courseId: 'c1' },
      context,
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'c1', title: 'Owned by admin' })
  })

  it('non-owner → 403, the leaf never runs', async () => {
    const context = await mount({ label: 'rr7' })
    const res = await courseLoader({
      request: bearer('u-admin'),
      params: { courseId: 'c2' },
      context,
    })
    expect(res.status).toBe(403)
  })

  it('anonymous → 401', async () => {
    const context = await mount({ label: 'rr7' })
    const res = await courseLoader({
      request: new Request('http://x/'),
      params: { courseId: 'c1' },
      context,
    })
    expect(res.status).toBe(401)
    await dispose()
  })
})
