import type { LoaderFunctionArgs } from 'react-router'
import { describe, expect, it } from 'vitest'
import { chain } from '../chain.ts'
import { makeHandlers } from '../example.ts'
import { toLoader } from './react-router.ts'

const bearer = (u: string) =>
  new Request('http://x/', { headers: { authorization: `Bearer ${u}` } })

const args = (request: Request, params: Record<string, string>): LoaderFunctionArgs =>
  ({ request, params, context: {} }) as unknown as LoaderFunctionArgs

describe('React Router 7 adapter — real loader invocation', () => {
  it('owner → 200 with the prefetched course', async () => {
    const { app, dispose } = await chain.build({ env: { label: 'rr7' } })
    const loader = toLoader(makeHandlers(app).course)

    const res = await loader(args(bearer('u-admin'), { courseId: 'c1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'c1', title: 'Owned by admin' })

    await dispose()
  })

  it('non-owner → 403, the leaf never runs', async () => {
    const { app, dispose } = await chain.build({ env: { label: 'rr7' } })
    const loader = toLoader(makeHandlers(app).course)

    const res = await loader(args(bearer('u-admin'), { courseId: 'c2' }))
    expect(res.status).toBe(403)

    await dispose()
  })

  it('anonymous → 401', async () => {
    const { app, dispose } = await chain.build({ env: { label: 'rr7' } })
    const loader = toLoader(makeHandlers(app).course)

    const res = await loader(args(new Request('http://x/'), { courseId: 'c1' }))
    expect(res.status).toBe(401)

    await dispose()
  })
})
