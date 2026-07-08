import { describe, expect, it } from 'vitest'
import { chain } from '../chain.ts'
import type { Repos } from '../domain.ts'
import { forbidden, notFound, unauthorized } from './abort.ts'
import { fragment } from './fragment.ts'
import { runFold } from './run-fold.ts'
import type { RequestScope } from './scope.ts'

const admin = (userId: string) =>
  new Request('http://x/', { headers: { authorization: `Bearer ${userId}` } })

// The fragment stack under test — the same one example.ts ships, inlined so the
// fold can be driven directly with the built app (no host in the loop).
const ownedCourse = fragment()
  .guard((app: Pick<Repos, 'sessionRepo'>, _params: {}, ctx) => {
    const session = app.sessionRepo.get(ctx.request)
    return session ? { session } : unauthorized()
  })
  .guard((app: Pick<Repos, 'adminRepo'>, _params: {}, ctx) => {
    const admin = app.adminRepo.byId(ctx.session.userId)
    return admin ? { admin } : forbidden()
  })
  .guard((app: Pick<Repos, 'courseRepo'>, params: { courseId: string }, ctx) => {
    const course = app.courseRepo.byId(params.courseId)
    if (!course) return notFound()
    return course.ownerId === ctx.admin.id ? { course } : forbidden()
  })
  .handle((deps) => ({ title: deps.course.title }))

describe('the fragment fold at runtime', () => {
  it('accumulates enrichments then runs the leaf; short-circuits on abort', async () => {
    const { app, dispose } = await chain.build({ env: { label: 'test' } })
    const run = (request: Request, params: { courseId: string }) =>
      runFold<RequestScope, { title: string }>(ownedCourse, app, { request }, params)

    // owner: full fold runs, leaf returns the prefetched course
    const ok = await run(admin('u-admin'), { courseId: 'c1' })
    expect(ok).toEqual({ ok: true, value: { title: 'Owned by admin' }, cookies: [] })

    // non-owner: ownership guard aborts 403, leaf never runs
    const forb = await run(admin('u-admin'), { courseId: 'c2' })
    expect(forb.ok).toBe(false)
    if (!forb.ok) expect(forb.abort.intent).toEqual({ kind: 'status', status: 403 })

    // missing course: 404 before ownership
    const missing = await run(admin('u-admin'), { courseId: 'nope' })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.abort.intent).toEqual({ kind: 'status', status: 404 })

    // no session: first guard aborts 401
    const anon = await run(new Request('http://x/'), { courseId: 'c1' })
    expect(anon.ok).toBe(false)
    if (!anon.ok) expect(anon.abort.intent).toEqual({ kind: 'status', status: 401 })

    await dispose()
  })

  it('the cookie sink collects Set-Cookie without changing the leaf return', async () => {
    const { app, dispose } = await chain.build({ env: { label: 'test' } })

    const handler = fragment().handle((deps) => {
      deps.cookies.set('sid', 'abc', { httpOnly: true })
      return { ok: true }
    })

    const out = await runFold<RequestScope, { ok: boolean }>(handler, app, {
      request: new Request('http://x/'),
    }, {})
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.value).toEqual({ ok: true })
    expect(out.cookies).toEqual([{ name: 'sid', value: 'abc', options: { httpOnly: true } }])

    await dispose()
  })
})
