import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { forbidden, httpError, notFound, unauthorized, http } from './extensions/http.ts'
import { scope } from './scope.ts'
import { cookies, readCookies } from './extensions/cookies.ts'
import type { RequestCarrier } from './carrier.ts'
import { makeRepos, type Repos } from './domain.fixture.ts'
import { runSteps, type Step } from './fold.ts'
import { guardStep, leafStep } from './steps.ts'
import type { Abort } from './abort.ts'
import { standardSchema } from './extensions/standard-schema.ts'

// The core fold, driven directly with a PLAIN app object — no host, no chain
// (@lntt/scope is framework-free; a wire chain is only a convenience for
// building that object in real apps).
const app = makeRepos()
const bearer = (userId: string) =>
  new Request('http://x/', { headers: { authorization: `Bearer ${userId}` } })

const schema = z.object({ courseId: z.string() })
// Reads `ctx.request` for the session AND has the HTTP vocabulary to abort
// with (`unauthorized`/`forbidden`/`notFound`) — the `http` profile.
const ownedCourse = scope(http)
  .extend(standardSchema)
  .validate('params', schema)
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
  // A scope IS the function that runs it: the app first (process lifetime),
  // everything belonging to THIS invocation second — the carrier the host holds
  // and the entries its router matched, in one seed.
  const run = (req: Request, params: { courseId: string }) =>
    ownedCourse(app, { request: req, params })

  it('accumulates enrichments then runs the leaf; short-circuits on abort', async () => {
    const ok = await run(bearer('u-admin'), { courseId: 'c1' })
    expect(ok).toEqual({
      ok: true,
      value: { id: 'c1', title: 'Owned by admin' },
      intent: undefined,
      effects: {},
    })

    const forb = await run(bearer('u-admin'), { courseId: 'c2' })
    expect(forb.ok).toBe(false)
    if (!forb.ok && 'abort' in forb) expect(forb.abort.intent).toEqual({ kind: 'status', status: 403 })
    else throw new Error('expected an abort')

    const missing = await run(bearer('u-admin'), { courseId: 'nope' })
    expect(missing.ok).toBe(false)
    if (!missing.ok && 'abort' in missing)
      expect(missing.abort.intent).toEqual({ kind: 'status', status: 404 })
    else throw new Error('expected an abort')

    const anon = await run(new Request('http://x/'), { courseId: 'c1' })
    expect(anon.ok).toBe(false)
    if (!anon.ok && 'abort' in anon) expect(anon.abort.intent).toEqual({ kind: 'status', status: 401 })
    else throw new Error('expected an abort')
  })

  // ACCUMULATES, not replaces. The chain above only ever reads the guard
  // immediately before it, so a fold that overwrote each enrichment with the
  // last would satisfy it. Real scopes read across hops — a leaf using a
  // session two guards back — so the leaf here reaches past its neighbour.
  it('keeps every enrichment reachable, not only the last one', async () => {
    const across = scope()
      .guard(() => ({ first: 'one' as const }))
      .guard(() => ({ second: 'two' as const }))
      .guard(() => ({ third: 'three' as const }))
      .handle((_deps: {}, ctx) => ({ seen: [ctx.first, ctx.second, ctx.third] }))

    const out = await across({}, { request: new Request('http://x/') })
    expect(out).toEqual({
      ok: true,
      value: { seen: ['one', 'two', 'three'] },
      intent: undefined,
      effects: {},
    })
  })
})

// The PRIMITIVE, driven directly: an ordered stack of steps around a leaf. Every
// verb the builder offers is sugar over this — a channel populating an entry, a
// `validate`, a guard, a sink — so what is tested here is the one mechanism they
// all reduce to, independent of any of them.
describe('the step stack', () => {
  const seed = { request: new Request('http://x/') }

  it('threads each step`s delta inward and runs the leaf at the centre', async () => {
    const populate: Step = (_app, _ctx, next) => next({ tag: 'from-a-step' as const })
    const out = await runSteps([populate, leafStep((_app: object, ctx: object) => ({ seen: (ctx as { tag?: string }).tag }))], {}, seed)
    expect(out).toEqual({ ok: true, value: { seen: 'from-a-step' }, intent: undefined, effects: {} })
  })

  it('a step that does not call next stops the fold — no later step, no leaf', async () => {
    let ran = false
    const stopper: Step = async () => ({
      ok: false,
      abort: forbidden() as unknown as Abort<never>,
      effects: {},
    })
    const out = await runSteps([stopper, guardStep(() => ((ran = true), {})), leafStep(() => ({ never: true }))], {}, seed)
    expect(ran).toBe(false)
    expect(out.ok).toBe(false)
  })

  it('the core`s own `invalid` branch stops it the same way', async () => {
    let ran = false
    const invalid: Step = async () => ({
      ok: false,
      invalid: { issues: [{ message: 'bad shape' }] },
      effects: {},
    })
    const out = await runSteps([invalid, guardStep(() => ((ran = true), {})), leafStep(() => ({ never: true }))], {}, seed)
    expect(ran).toBe(false)
    expect(out.ok === false && 'invalid' in out && out.invalid.issues[0]?.message).toBe('bad shape')
  })

  it('runs steps IN THE ORDER THEY WERE WRITTEN, not by category', async () => {
    const order: string[] = []
    const mark = (name: string): Step => (_app, _ctx, next) => {
      order.push(name)
      return next({})
    }
    await runSteps([mark('a'), guardStep(() => (order.push('guard'), {})), mark('b'), leafStep(() => {
      order.push('leaf')
      return {}
    })], {}, seed)
    // The property that makes `gated().extend(body('json'))` authenticate BEFORE
    // the body is read: nothing is hoisted, so a guard that aborts first means
    // the parse never happens.
    expect(order).toEqual(['a', 'guard', 'b', 'leaf'])
  })
})

describe('sinks, as steps that wrap the rest', () => {
  const seed = { request: new Request('http://x/') }
  // A collecting step, written the way a channel writes one: open the
  // collector, hand its surface inward, attach what it collected on the way
  // out. There is no `Sink` shape in between — the loop that needed one is gone.
  const audit = (): Step => async (_app, _ctx, next) => {
    const written: string[] = []
    const out = await next({ audit: { note: (what: string) => void written.push(what) } })
    return { ...out, effects: { ...out.effects, audit: written } }
  }

  it('opens one per invocation and collects it into the outcome', async () => {
    const leaf = (_app: object, ctx: object) => {
      ;(ctx as { audit: { note(w: string): void } }).audit.note('leaf')
      return { ok: true }
    }
    const stack = [audit(), leafStep(leaf)]
    const first = await runSteps(stack, {}, seed)
    const second = await runSteps(stack, {}, seed)
    // fresh each time: a sink that leaked across invocations would show two
    expect(first.effects).toEqual({ audit: ['leaf'] })
    expect(second.effects).toEqual({ audit: ['leaf'] })
  })

  it('keeps what it collected when something deeper short-circuits', async () => {
    const out = await runSteps(
      [
        audit(),
        guardStep((_app: object, ctx: object) => {
          ;(ctx as { audit: { note(w: string): void } }).audit.note('ran')
          return httpError(429)
        }),
        leafStep(() => ({ never: true })),
      ],
      {},
      seed,
    )
    // The sink WRAPS the rest, so an abort from inside still comes back out
    // through it — which is what a logout (drop the cookie, then redirect)
    // depends on.
    expect(out.ok).toBe(false)
    expect(out.effects).toEqual({ audit: ['ran'] })
  })

  it('leaves effects empty for a stack with no sink at all', async () => {
    const out = await runSteps([leafStep(() => ({ ok: true }))], {}, seed)
    expect(out.effects).toEqual({})
  })
})

describe('effects on a leaf abort', () => {
  it('carries what the leaf wrote before it aborted', async () => {
    const s = scope(http)
      .extend(cookies)
      .handle((_deps: {}, ctx) => {
        // A logout is exactly this shape: drop the cookie AND redirect.
        ctx.response.cookies.set('session', '', { maxAge: 0 })
        return forbidden()
      })

    const out = await s<{}, 'set-cookie'>(
      {},
      { request: new Request('http://x/'), params: {} },
    )
    expect(out.ok).toBe(false)
    expect(readCookies(out)).toEqual([{ name: 'session', value: '', options: { maxAge: 0 } }])
  })
})

// `.step()` puts the primitive in the open, and this is what makes that claim
// checkable rather than a story: the same thing the builder's other verbs
// produce, written by hand, composing with them and running where it is written.
describe('.step() — the primitive, in userland', () => {
  it('composes with the sugar and runs in declaration order', async () => {
    const order: string[] = []
    const s = scope(http)
      .guard(() => (order.push('guard-a'), { a: 1 as const }))
      .step(async (_app, ctx, next) => {
        order.push('step')
        // it sees what came before, and may enrich — the types just do not
        // know about it, which is the honest price of claiming nothing
        expect((ctx as { a?: number }).a).toBe(1)
        return next({ fromStep: true })
      })
      .guard(() => (order.push('guard-b'), {}))
      .handle((_deps: {}, ctx) => {
        order.push('leaf')
        return { seen: (ctx as { fromStep?: boolean }).fromStep }
      })

    const out = await s({}, { request: new Request('http://x/'), params: {} })
    expect(order).toEqual(['guard-a', 'step', 'guard-b', 'leaf'])
    expect(out.ok && out.value).toEqual({ seen: true })
  })

  it('can stop the fold by not calling next, like any other step', async () => {
    let reached = false
    const s = scope(http)
      .step(async () => ({ ok: false, abort: forbidden() as never, effects: {} }))
      .handle(() => ((reached = true), { never: true }))

    const out = await s({}, { request: new Request('http://x/'), params: {} })
    expect(reached).toBe(false)
    expect(out.ok).toBe(false)
  })
})

// THE PARITY TEST. If the sugar is really sugar, the same scope written with
// nothing but `.step()` must behave identically — same enrichments, same
// short-circuit, same effects. What the sugar buys is not power: it is not
// having to call `next` correctly.
describe('the sugar is sugar', () => {
  const seed = () => ({ request: bearer('u-admin'), params: { courseId: 'c1' } })

  // The three fold behaviours, hand-written: let through or stop (a guard),
  // wrap `next` and act on the way out (a collecting channel), stop without
  // continuing (a leaf). The guard here GUARDS — it admits admins and refuses
  // everyone else — which is the shape the verb is named for; one that only
  // enriches is the degenerate case of the same shape.
  const sugared = scope(http)
    .extend(cookies)
    .guard((deps: Pick<Repos, 'sessionRepo' | 'adminRepo'>, ctx) => {
      const session = deps.sessionRepo.get(ctx.request)
      if (!session) return unauthorized()
      const admin = deps.adminRepo.byId(session.userId)
      return admin ? { admin } : forbidden()
    })
    .handle((_deps: {}, ctx) => {
      ctx.response.cookies.set('seen', ctx.admin.id)
      return { who: ctx.admin.id }
    })

  const raw = scope(http)
    .step(async (_app, ctx, next) => {
      // what the `cookies` channel's step does, by hand
      const pending: { name: string; value: string; options: object }[] = []
      const response = (ctx as { response?: object }).response
      const out = await next({
        response: {
          ...response,
          cookies: { set: (name: string, value: string, options = {}) => void pending.push({ name, value, options }) },
        },
      })
      return { ...out, effects: { ...out.effects, cookies: pending } }
    })
    .step(async (app, ctx, next) => {
      // what `guardStep` does, by hand
      const deps = app as Pick<Repos, 'sessionRepo' | 'adminRepo'>
      const session = deps.sessionRepo.get((ctx as { request: Request }).request)
      if (!session) return { ok: false, abort: unauthorized() as never, effects: {} }
      const admin = deps.adminRepo.byId(session.userId)
      if (!admin) return { ok: false, abort: forbidden() as never, effects: {} }
      return next({ admin })
    })
    .step(async (_app, ctx) => {
      // what `leafStep` does, by hand: it simply never calls `next`
      const c = ctx as {
        admin: { id: string }
        response: { cookies: { set(n: string, v: string): void } }
      }
      c.response.cookies.set('seen', c.admin.id)
      return { ok: true, value: { who: c.admin.id }, intent: undefined, effects: {} }
    })
    // `.handle` is still required, and that is the honest limit: closing the
    // builder into a callable is not fold work, so no raw step can do it.
    .handle(() => ({ unreachable: true }))

  it('produces the same outcome either way', async () => {
    const a = await sugared<Repos, 'set-cookie'>(app, seed())
    const b = await raw<Repos, 'set-cookie'>(app, seed())
    expect(a.ok && a.value).toEqual({ who: 'u-admin' })
    expect(b.ok && b.value).toEqual({ who: 'u-admin' })
    expect(readCookies(a)).toEqual(readCookies(b))
  })

  it('short-circuits the same way when the guard refuses', async () => {
    const anon = { request: new Request('http://x/'), params: { courseId: 'c1' } }
    const a = await sugared<Repos, 'set-cookie'>(app, anon)
    const b = await raw<Repos, 'set-cookie'>(app, anon)
    expect(a.ok).toBe(false)
    expect(b.ok).toBe(false)
  })

  it('refuses an EXTENSION here, naming the verb that keeps its declarations', () => {
    // @ts-expect-error ⛔ this declares things — add it with .extend, which keeps them
    scope(http).step(cookies)
  })
})
