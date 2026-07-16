import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { forbidden, notFound, unauthorized } from './abort.ts'
import { scope } from './scope.ts'
import { request } from './extensions/request.ts'
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
})

// The fold runs extension `prepare` steps FIRST, over the raw carrier, and owns
// the cookie sink — tested here generically (a plain handler + a fake step),
// independent of any one extension.
describe('the fold — prepare steps and the cookie sink', () => {
  it('runs prepare steps before the guards, merging their enrichment into ctx', async () => {
    const handler = {
      guards: [],
      prepare: [async () => ({ tag: 'from-prepare' as const })],
      leaf: (_app: object, ctx: { tag?: string }) => ({ seen: ctx.tag }),
    }
    const out = await runFold<object, { seen: string | undefined }>(handler, {}, {}, {})
    expect(out).toEqual({ ok: true, value: { seen: 'from-prepare' }, cookies: [] })
  })

  it('a prepare step returning an abort short-circuits — no guards, no leaf', async () => {
    let ran = false
    const handler = {
      guards: [() => ((ran = true), {})],
      prepare: [async () => forbidden()],
      leaf: () => ({}),
    }
    const out = await runFold<object, object>(handler, {}, {}, {})
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.abort.intent).toMatchObject({ status: 403 })
    expect(ran).toBe(false)
  })

  it('creates the cookie sink; a leaf that sets one has it collected into the Outcome', async () => {
    const handler = {
      guards: [],
      prepare: [],
      leaf: (_app: object, ctx: object) => {
        ;(ctx as { cookies: { set(n: string, v: string, o?: object): void } }).cookies.set(
          'sid',
          'abc',
          { httpOnly: true },
        )
        return { ok: true }
      },
    }
    const out = await runFold<object, { ok: boolean }>(handler, {}, {}, {})
    expect(out).toEqual({
      ok: true,
      value: { ok: true },
      cookies: [{ name: 'sid', value: 'abc', options: { httpOnly: true } }],
    })
  })
})
