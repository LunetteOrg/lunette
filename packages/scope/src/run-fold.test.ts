import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { forbidden, httpError, notFound, unauthorized } from './abort.ts'
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
    expect(ok).toEqual({ ok: true, value: { id: 'c1', title: 'Owned by admin' }, effects: {} })

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
// the extension sinks — tested here generically (a plain handler + a fake step),
// independent of any one extension.
describe('the fold — prepare steps and extension sinks', () => {
  it('runs prepare steps before the guards, merging their enrichment into ctx', async () => {
    const handler = {
      guards: [],
      prepare: [async () => ({ tag: 'from-prepare' as const })],
      leaf: (_app: object, ctx: { tag?: string }) => ({ seen: ctx.tag }),
    }
    const out = await runFold<object, { seen: string | undefined }>(handler, {}, {}, {})
    expect(out).toEqual({ ok: true, value: { seen: 'from-prepare' }, effects: {} })
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

  it('instantiates extension SINKS per invocation and collects them by key', async () => {
    // The fold knows only the shape (`key`, `ctx`, `collect`) — never what a
    // sink means. A cookie jar and a header bag are indistinguishable from here,
    // which is what keeps response concerns out of the core.
    const notes: string[] = []
    const handler = {
      guards: [],
      prepare: [],
      sinks: [
        () => {
          const written: string[] = []
          notes.push('created')
          return {
            key: 'audit',
            ctx: { note: (what: string) => written.push(what) },
            collect: () => written,
          }
        },
      ],
      leaf: (_app: object, ctx: object) => {
        ;(ctx as { audit: { note(w: string): void } }).audit.note('leaf ran')
        return { ok: true }
      },
    }

    const out = await runFold<object, { ok: boolean }, { audit: string[] }>(handler, {}, {}, {})
    expect(out.effects).toEqual({ audit: ['leaf ran'] })

    // per INVOCATION: a second run starts from an empty sink
    const again = await runFold<object, { ok: boolean }, { audit: string[] }>(handler, {}, {}, {})
    expect(again.effects).toEqual({ audit: ['leaf ran'] })
    expect(notes).toEqual(['created', 'created'])
  })

  it('collects what the sinks hold even when a guard aborts', async () => {
    // A 4xx still carries its effects: a rate-limit guard that records something
    // and then aborts must have both travel out.
    const handler = {
      guards: [
        (_app: object, ctx: object) => {
          ;(ctx as { audit: { note(w: string): void } }).audit.note('rejected')
          return httpError(429)
        },
      ],
      prepare: [],
      sinks: [
        () => {
          const written: string[] = []
          return { key: 'audit', ctx: { note: (w: string) => written.push(w) }, collect: () => written }
        },
      ],
      leaf: () => ({ never: true }),
    }

    const out = await runFold<object, { never: boolean }, { audit: string[] }>(handler, {}, {}, {})
    expect(out.ok).toBe(false)
    expect(out.effects).toEqual({ audit: ['rejected'] })
  })

  it('leaves effects empty for a scope that injected no sink at all', async () => {
    const out = await runFold<object, { ok: boolean }>(
      { guards: [], prepare: [], leaf: () => ({ ok: true }) },
      {},
      {},
      {},
    )
    expect(out.effects).toEqual({})
  })
})
