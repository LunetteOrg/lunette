import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { forbidden, notFound, unauthorized } from './abort.ts'
import { scope } from './scope.ts'
import { request } from './extensions/request.ts'
import { body } from './extensions/body.ts'
import { cookies } from './extensions/cookies.ts'
import { runFold } from './run-fold.ts'
import type { RequestCarrier } from './carrier.ts'
import { makeRepos, type Repos } from './domain.fixture.ts'

// The core fold, driven directly with a PLAIN app object — no host, no chain
// (@lntt/scope is framework-free; a wire chain is only a convenience for
// building that object in real apps).
const app = makeRepos()
const bearer = (userId: string) =>
  new Request('http://x/', { headers: { authorization: `Bearer ${userId}` } })

const schema = z.object({ courseId: z.string() })
// Reads `ctx.request` for the session → the `request` profile.
const ownedCourse = scope().extend(request)
  .input(schema)
  .guard((deps: Pick<Repos, 'sessionRepo'>, ctx) => {
    const session = deps.sessionRepo.get(ctx.request)
    return session ? { session } : unauthorized()
  })
  .guard((deps: Pick<Repos, 'adminRepo'>, ctx) => {
    const admin = deps.adminRepo.byId(ctx.session.userId)
    return admin ? { admin } : forbidden()
  })
  .guard((deps: Pick<Repos, 'courseRepo'>, ctx) => {
    const course = deps.courseRepo.byId(ctx.params.courseId)
    if (!course) return notFound()
    return course.ownerId === ctx.admin.id ? { course } : forbidden()
  })
  // the leaf declares its own use-case service and delegates
  .handle((deps: Pick<Repos, 'courseView'>, ctx) => deps.courseView.detail(ctx.course))

describe('the scope fold at runtime', () => {
  const run = (req: Request, params: { courseId: string }) =>
    runFold<RequestCarrier, { id: string; title: string }>(ownedCourse, app, { request: req }, params)

  it('accumulates enrichments then runs the leaf; short-circuits on abort', async () => {
    const ok = await run(bearer('u-admin'), { courseId: 'c1' })
    expect(ok).toEqual({ ok: true, value: { id: 'c1', title: 'Owned by admin' }, cookies: [] })

    const forb = await run(bearer('u-admin'), { courseId: 'c2' })
    expect(forb.ok).toBe(false)
    if (!forb.ok) expect(forb.abort.intent).toEqual({ kind: 'status', status: 403 })

    const missing = await run(bearer('u-admin'), { courseId: 'nope' })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.abort.intent).toEqual({ kind: 'status', status: 404 })

    const anon = await run(new Request('http://x/'), { courseId: 'c1' })
    expect(anon.ok).toBe(false)
    if (!anon.ok) expect(anon.abort.intent).toEqual({ kind: 'status', status: 401 })
  })

  it('the cookie sink collects Set-Cookie without changing the leaf return', async () => {
    // Sets a cookie → the `cookies` extension brings the sink.
    const handler = scope().extend(cookies).handle((_deps: {}, ctx) => {
      ctx.cookies.set('sid', 'abc', { httpOnly: true })
      return { ok: true }
    })
    const out = await runFold<RequestCarrier, { ok: boolean }>(
      handler,
      {},
      { request: new Request('http://x/') },
      {},
    )
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.value).toEqual({ ok: true })
    expect(out.cookies).toEqual([{ name: 'sid', value: 'abc', options: { httpOnly: true } }])
  })

  it('.body parses + validates the JSON body into ctx.body; a bad body → 422', async () => {
    const bodySchema = z.object({ title: z.string() })
    const handler = scope().extend(body)
      .body(bodySchema)
      .handle((_deps: {}, ctx) => ({ echoed: ctx.body.title }))
    const jsonReq = (body: unknown) =>
      new Request('http://x/', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      })

    const ok = await runFold<RequestCarrier, { echoed: string }>(
      handler,
      {},
      { request: jsonReq({ title: 'Hello' }) },
      {},
    )
    expect(ok).toEqual({ ok: true, value: { echoed: 'Hello' }, cookies: [] })

    // a body missing the required field is a RETURNED 422 (the error convention)
    const bad = await runFold<RequestCarrier, { echoed: string }>(
      handler,
      {},
      { request: jsonReq({ nope: 1 }) },
      {},
    )
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.abort.intent).toMatchObject({ kind: 'status', status: 422 })
  })

  it('.form parses + validates the form body into ctx.form', async () => {
    const formSchema = z.object({ email: z.string() })
    const handler = scope().extend(body)
      .form(formSchema)
      .handle((_deps: {}, ctx) => ({ to: ctx.form.email }))
    const fd = new FormData()
    fd.set('email', 'user@example.com')
    const out = await runFold<RequestCarrier, { to: string }>(
      handler,
      {},
      { request: new Request('http://x/', { method: 'POST', body: fd }) },
      {},
    )
    expect(out).toEqual({ ok: true, value: { to: 'user@example.com' }, cookies: [] })
  })
})
