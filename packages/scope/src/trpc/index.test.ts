import { describe, expect, it } from 'vitest'
import { initTRPC, TRPCError } from '@trpc/server'
import { scope, type Next } from '../index.ts'
import { trpc } from './index.ts'

// The application's own context. It is named HERE, where tRPC's builder is
// made, and nowhere else: the carrier reads it back off `t`.
type Context = { readonly actorId: string | undefined }

const t = initTRPC.context<Context>().create()

// A guard, written here rather than imported: what a guard IS belongs to no
// carrier (§43). It stops the way tRPC stops — a thrown `TRPCError`, its one
// door.
const requireActor = async (
  _app: {},
  { ctx }: { readonly ctx: Context },
  next: Next<{ actor: string }>,
) => {
  if (ctx.actorId === undefined) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ actor: ctx.actorId })
}

const greeter = { greet: (who: string) => `hello ${who}` }

describe('the tRPC carrier: what a run brings', () => {
  const { carrier, procedure } = trpc(t, greeter)

  const router = t.router({
    greet: t.procedure.input((v) => v as { readonly who: string }).query(
      procedure(
        scope(carrier()).step(
          async ({ greet }: typeof greeter, { input, ctx }) => ({
            said: greet((input as { readonly who: string }).who),
            by: ctx.actorId ?? 'anonymous',
          }),
        ),
      ),
    ),

    whoami: t.procedure.query(
      procedure(
        scope(carrier())
          .step(requireActor)
          .step(async (_app: {}, { actor }: { readonly actor: string }) => ({ actor })),
      ),
    ),
  })

  const caller = (ctx: Context) => router.createCaller(ctx)

  it('hands the step `input` and the transport-made `ctx`, and the app its deps', async () => {
    const result = await caller({ actorId: 'u1' }).greet({ who: 'ada' })
    expect(result).toEqual({ said: 'hello ada', by: 'u1' })
  })

  it('the context is TYPED — inferred off `t`, with no type argument written', async () => {
    const result = await caller({ actorId: undefined }).greet({ who: 'ada' })
    expect(result).toEqual({ said: 'hello ada', by: 'anonymous' })
  })

  it('a step that stops throws tRPC\'s own error, and the leaf never runs', async () => {
    await expect(caller({ actorId: undefined }).whoami()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('what the leaf returned is what the procedure resolves with', async () => {
    expect(await caller({ actorId: 'u1' }).whoami()).toEqual({ actor: 'u1' })
  })
})

describe('the tRPC carrier: `.input()` is still the read AND the check', () => {
  it('an invalid input is refused before the scope runs at all', async () => {
    let ran = false
    const { carrier, procedure } = trpc(t, {})

    const router = t.router({
      strict: t.procedure
        .input((v: unknown) => {
          const { who } = v as { readonly who?: string }
          if (typeof who !== 'string' || who === '') throw new Error('invalid')
          return { who }
        })
        .query(
          procedure(
            scope(carrier()).step(async (_app: {}, { input }) => {
              ran = true
              return input
            }),
          ),
        ),
    })

    await expect(router.createCaller({ actorId: undefined }).strict({ who: '' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(ran).toBe(false)
  })
})

describe('the tRPC carrier: `middleware`', () => {
  const { carrier, middleware } = trpc(t, greeter)

  // The same guard shape as everywhere else — it derives, or it stops in the
  // host's own door.
  const authed = t.middleware(middleware(scope(carrier()).step(requireActor)))

  const router = t.router({
    who: t.procedure.use(authed).query(({ ctx }) => ({ actor: ctx.actor, seen: ctx.actorId })),
  })

  it('what the steps derived becomes tRPC\'s context override, reaching the procedure', async () => {
    const result = await router.createCaller({ actorId: 'u1' }).who()
    expect(result).toEqual({ actor: 'u1', seen: 'u1' })
  })

  it('a step that stops never reaches the procedure', async () => {
    await expect(router.createCaller({ actorId: undefined }).who()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('the middleware is reusable: two procedures share one scope', async () => {
    const two = t.router({
      a: t.procedure.use(authed).query(({ ctx }) => ctx.actor),
      b: t.procedure.use(authed).mutation(({ ctx }) => ctx.actor.toUpperCase()),
    })

    const caller = two.createCaller({ actorId: 'u2' })
    expect(await caller.a()).toBe('u2')
    expect(await caller.b()).toBe('U2')
  })
})

// ── the third run every mount owes: a step that acts AFTER `next` ───────────
describe('the tRPC carrier: a middleware step may act AFTER next()', () => {
  it('runs after the procedure, because tRPC hands the promise straight back', async () => {
    const order: string[] = []

    const around = async (_app: {}, _ctx: object, next: Next<{}>) => {
      order.push('before')
      const passed = await next({})
      order.push('after-next')
      return passed
    }

    const { carrier, middleware } = trpc(t, greeter)
    const wrapped = t.middleware(middleware(scope(carrier()).step(around)))

    const router = t.router({
      who: t.procedure.use(wrapped).query(async () => {
        await new Promise((r) => setTimeout(r, 10))
        order.push('procedure')
        return 'ok'
      }),
    })

    expect(await router.createCaller({ actorId: 'u1' }).who()).toBe('ok')
    // the same order Hono gives, and the OPPOSITE of Express's — see the limit
    // stated on `toNext` in `express/index.ts`
    expect(order).toEqual(['before', 'procedure', 'after-next'])
  })
})
