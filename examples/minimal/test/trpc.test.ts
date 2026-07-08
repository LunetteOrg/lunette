import { describe, expect, it } from 'vitest'
import { chain } from '../src/chain.ts'
import { createCaller } from '../src/trpc.ts'

// Build the app singletons ONCE, then a caller per request carrying the auth
// header in ctx (the carrier `request` the fragment reads).
async function callerFor(authorization: string) {
  const { app } = await chain.build({ env: { label: 'trpc' } })
  const request = new Request('http://x/', { headers: { authorization } })
  return createCaller({ ...app, request })
}

describe('tRPC host — the shared fragment folded into one procedure', () => {
  it('owner → the leaf value', async () => {
    const caller = await callerFor('Bearer u-admin')
    const out = await caller.courses.get({ courseId: 'c1' })
    expect(out).toEqual({ id: 'c1', title: 'Owned by admin' })
  })

  it('non-owner → FORBIDDEN (domain abort)', async () => {
    const caller = await callerFor('Bearer u-admin')
    await expect(caller.courses.get({ courseId: 'c2' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('missing course → NOT_FOUND (domain abort)', async () => {
    const caller = await callerFor('Bearer u-admin')
    await expect(caller.courses.get({ courseId: 'nope' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
