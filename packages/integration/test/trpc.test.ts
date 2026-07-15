// Runtime proof for the tRPC host: the scope's decision functions
// (authenticate/resolveAdmin/resolveCourse/shapeCourse — the SAME consts the
// HTTP/bus hosts use) re-expressed as ONE tRPC procedure. A domain Abort
// surfaces as a specific 4xx TRPCError, an infra throw stays
// INTERNAL_SERVER_ERROR, and the happy path returns the leaf value.

import { initTRPC, TRPCError } from '@trpc/server'
import { describe, expect, it } from 'vitest'
import { authenticate, courseSchema, resolveAdmin, resolveCourse, shapeCourse } from './fixture/handlers.ts'
import { makeRepos, type Admin, type Course, type Repos, type Session } from './fixture/domain.ts'
import { guard, leaf, type InputOf } from '../src/trpc.ts'

// The built app singletons (chain.build's Pub = makeRepos()) arrive as ctx.
type App = Repos
type In = InputOf<typeof courseSchema>
const t = initTRPC.context<App>().create()

// The scope mapped natively: `.input` = the schema, each `.use` = a guard,
// `.query` = the leaf. ctx accumulates App → +session → +admin → +course. The
// session guard reads a fixed request (the caller's sessionRepo ignores it).
const courseProcedure = t.procedure
  .input(courseSchema)
  .use(guard<App, In, { session: Session }>((d) => authenticate(d.sessionRepo, new Request('http://x/'))))
  .use(
    guard<App & { session: Session }, In, { admin: Admin }>((d) =>
      resolveAdmin(d.adminRepo, d.session.userId),
    ),
  )
  .use(
    guard<App & { session: Session; admin: Admin }, In, { course: Course }>((d) =>
      resolveCourse(d.courseRepo, d.input.courseId, d.admin.id),
    ),
  )
  .query(
    leaf<App & { session: Session; admin: Admin; course: Course }, In, { id: string; title: string }>(
      (d) => shapeCourse(d.course),
    ),
  )

// A second procedure to prove the infra-throw channel stays distinct.
const boomProcedure = t.procedure.query(
  leaf<App, void, never>(() => {
    throw new Error('db down') // infrastructure: NOT an Abort
  }),
)

const appRouter = t.router({
  courses: t.router({ get: courseProcedure }),
  boom: boomProcedure,
})
export type AppRouter = typeof appRouter

const createCaller = t.createCallerFactory(appRouter)

function callerFor(): ReturnType<typeof createCaller> {
  return createCaller(makeRepos())
}

// Make a given user the session by wiring a repo whose get() returns that user.
function callerAs(userId: string | null): ReturnType<typeof createCaller> {
  const repos = makeRepos()
  return createCaller({
    ...repos,
    sessionRepo: { get: () => (userId ? { userId } : null) },
  })
}

describe('scope → tRPC procedure', () => {
  it('happy path returns the leaf value', async () => {
    const caller = callerAs('u-admin')
    const out = await caller.courses.get({ courseId: 'c1' })
    expect(out).toEqual({ id: 'c1', title: 'Owned by admin' })
  })

  it('unauthorized abort → UNAUTHORIZED TRPCError (domain)', async () => {
    const caller = callerAs(null)
    await expect(caller.courses.get({ courseId: 'c1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('ownership abort → FORBIDDEN TRPCError with message (domain)', async () => {
    const caller = callerAs('u-admin')
    // c2 is owned by u-other → forbidden('not owner')
    await expect(caller.courses.get({ courseId: 'c2' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'not owner',
    })
  })

  it('missing course → NOT_FOUND TRPCError (domain)', async () => {
    const caller = callerAs('u-admin')
    await expect(caller.courses.get({ courseId: 'nope' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('bad input → BAD_REQUEST from the native validator (not our abort)', async () => {
    const caller = callerAs('u-admin')
    // @ts-expect-error courseId is required by the schema
    await expect(caller.courses.get({})).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('infra throw → INTERNAL_SERVER_ERROR (stays infrastructure)', async () => {
    const caller = callerFor()
    const err = await caller.boom().then(
      () => null,
      (e) => e,
    )
    expect(err).toBeInstanceOf(TRPCError)
    expect(err.code).toBe('INTERNAL_SERVER_ERROR')
    expect(err.cause).toBeInstanceOf(Error)
  })
})
