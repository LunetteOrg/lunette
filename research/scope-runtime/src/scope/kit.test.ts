import { describe, expect, it } from 'vitest'
import { chain } from '../chain.ts'
import { forbidden, notFound, unauthorized } from './abort.ts'
import { scopeFor } from './kit.ts'

const admin = (userId: string) =>
  new Request('http://x/', { headers: { authorization: `Bearer ${userId}` } })

describe('scope kit — the guard fold at runtime', () => {
  it('accumulates enrichments then runs the leaf; short-circuits on abort', async () => {
    const { app, dispose } = await chain.build({ env: { label: 'test' } })
    const kit = scopeFor(app)

    const ownedCourse = kit
      .guard((d) => {
        const s = d.sessionRepo.get(d.request)
        return s ? { session: s } : unauthorized()
      })
      .guard((d) => {
        const a = d.adminRepo.byId(d.session.userId)
        return a ? { admin: a } : forbidden()
      })
      .guard((d) => {
        const c = d.courseRepo.byId(d.params.courseId ?? '')
        if (!c) return notFound()
        return c.ownerId === d.admin.id ? { course: c } : forbidden()
      })

    const handler = kit.handle(ownedCourse, (deps) => ({ title: deps.course.title }))

    // owner: full fold runs, leaf returns the prefetched course
    const ok = await handler({ request: admin('u-admin'), params: { courseId: 'c1' } })
    expect(ok).toEqual({ ok: true, value: { title: 'Owned by admin' }, cookies: [] })

    // non-owner: ownership guard aborts 403, leaf never runs
    const forb = await handler({ request: admin('u-admin'), params: { courseId: 'c2' } })
    expect(forb.ok).toBe(false)
    if (!forb.ok) expect(forb.abort.intent).toEqual({ kind: 'status', status: 403 })

    // missing course: 404 before ownership
    const missing = await handler({ request: admin('u-admin'), params: { courseId: 'nope' } })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.abort.intent).toEqual({ kind: 'status', status: 404 })

    // no session: first guard aborts 401
    const anon = await handler({ request: new Request('http://x/'), params: { courseId: 'c1' } })
    expect(anon.ok).toBe(false)
    if (!anon.ok) expect(anon.abort.intent).toEqual({ kind: 'status', status: 401 })

    await dispose()
  })

  it('the cookie sink collects Set-Cookie without changing the leaf return', async () => {
    const { app, dispose } = await chain.build({ env: { label: 'test' } })
    const kit = scopeFor(app)

    const handler = kit.handle((deps) => {
      deps.cookies.set('sid', 'abc', { httpOnly: true })
      return { ok: true }
    })

    const out = await handler({ request: new Request('http://x/'), params: {} })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.value).toEqual({ ok: true })
    expect(out.cookies).toEqual([{ name: 'sid', value: 'abc', options: { httpOnly: true } }])

    await dispose()
  })
})
