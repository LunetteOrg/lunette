// Runtime proof for `toProcedure`: a whole fragment Handler (courseHandler —
// authenticate/resolveAdmin/resolveCourse/shapeCourse) folded into ONE native
// tRPC procedure in a single call. The carrier `request` rides in ctx; a domain
// Abort surfaces as a specific 4xx TRPCError, the happy path returns the leaf
// value.

import { initTRPC } from '@trpc/server'
import { describe, expect, it } from 'vitest'
import { chain, type App } from '../chain.ts'
import { courseHandler } from '../example.ts'
import { toProcedure } from './trpc.ts'

type Ctx = App & { request: Request }
const t = initTRPC.context<Ctx>().create()

const appRouter = t.router({ courses: t.router({ get: toProcedure(t.procedure, courseHandler) }) })
const createCaller = t.createCallerFactory(appRouter)

// Build the app singletons ONCE, then a caller per request with the auth header.
async function callerFor(authorization: string) {
  const { app } = await chain.build({ env: { label: 'trpc' } })
  const request = new Request('http://x/', { headers: { authorization } })
  return createCaller({ ...app, request } satisfies Ctx)
}

describe('toProcedure — fragment → tRPC procedure, one call', () => {
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
