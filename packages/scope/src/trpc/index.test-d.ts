import { initTRPC } from '@trpc/server'
import type { inferRouterOutputs } from '@trpc/server'
import { describe, expectTypeOf, it } from 'vitest'
import { scope, type Next } from '../index.ts'
import { trpc } from './index.ts'

// THE TYPE CONTRACT for this carrier: what it claims is that the app's context
// arrives TYPED at every step, with the type written nowhere — so the claim is
// only checkable here, and a runtime test could not make it.
//
// NOTHING HERE RUNS: a `*.test-d.ts` is typechecked and never executed, and the
// refusals sit under `@ts-expect-error` inside functions nobody calls.

type Context = { readonly actorId: string | undefined; readonly tenant: string }

const t = initTRPC.context<Context>().create()

describe('what the carrier reads off the tRPC builder', () => {
  it('hands a step the app\'s own context, inferred — no type argument written', () => {
    const { carrier } = trpc(t, {})

    scope(carrier()).step(async (_app: {}, ctx) => {
      expectTypeOf(ctx.ctx).toEqualTypeOf<Context>()
      expectTypeOf(ctx.input).toEqualTypeOf<unknown>()
      return ctx.ctx.tenant
    })
  })

  it('refuses a step that reads a key the context does not have', () => {
    const { carrier } = trpc(t, {})

    // @ts-expect-error — `region` is not on this app's context
    scope(carrier()).step(async (_app: {}, ctx) => ctx.ctx.region)
  })

  it('fails CLOSED on something that is not a tRPC builder: the ctx is `never`', () => {
    const { carrier } = trpc({ not: 'a builder' }, {})

    // @ts-expect-error — nothing is readable off a `never` context, so a
    // mistyped first argument stops here rather than widening to `{}`
    scope(carrier()).step(async (_app: {}, ctx) => ctx.ctx.actorId)
  })
})

describe('the mount is transparent: tRPC infers the output off the resolver', () => {
  it('carries the leaf\'s value into the router\'s output types', () => {
    const { carrier, procedure } = trpc(t, {})

    const router = t.router({
      getPost: t.procedure.query(
        procedure(scope(carrier()).step(async (_app: {}, _ctx) => ({ id: '1', title: 'x' }))),
      ),
    })

    // What a tRPC client would see. A wrapper declaring `unknown` — or
    // widening `R` — erases it here and nowhere else says so.
    expectTypeOf<inferRouterOutputs<typeof router>['getPost']>().toEqualTypeOf<{
      id: string
      title: string
    }>()
  })
})

describe('a scope as a tRPC middleware', () => {
  it('carries what the steps derived into the context of every procedure downstream', () => {
    const { carrier, middleware } = trpc(t, {})

    const authed = t.middleware(
      middleware(
        scope(carrier()).step(
          async (_app: {}, { ctx }: { readonly ctx: Context }, next: Next<{ actor: string }>) => {
            if (ctx.actorId === undefined) throw new Error('no')
            return next({ actor: ctx.actorId })
          },
        ),
      ),
    )

    t.procedure.use(authed).query(({ ctx }) => {
      // what the middleware derived, TYPED — this is what tRPC reads off the
      // middleware's declared return type, and an inferred one erases it
      expectTypeOf(ctx.actor).toEqualTypeOf<string>()
      // and the app's own context is still there
      expectTypeOf(ctx.actorId).toEqualTypeOf<string | undefined>()
      return ctx.actor
    })
  })
})

describe('what `.input(schema)` supplies against what the scope reads', () => {
  const { carrier, procedure } = trpc(t, {})

  // The scope declares the input it reads — no cast anywhere in the step.
  const byId = scope(carrier<{ id: string }>()).step(async (_app: {}, { input }) => {
    expectTypeOf(input).toEqualTypeOf<{ id: string }>()
    return input.id
  })

  it('accepts a procedure whose schema supplies it', () => {
    t.procedure.input((v: unknown) => v as { id: string }).query(procedure(byId))
  })

  it('refuses a procedure whose schema supplies something else', () => {
    // @ts-expect-error — the schema supplies `slug`, the scope reads `id`: the
    // resolver is handed the schema's output, so contravariance refuses it
    t.procedure.input((v: unknown) => v as { slug: string }).query(procedure(byId))
  })

  it('refuses a procedure with no input at all', () => {
    // A procedure without `.input()` hands its resolver `input: undefined`, so
    // this is the same refusal as a mismatched schema rather than a special
    // case: nothing supplies the `id` this scope reads.
    // @ts-expect-error
    t.procedure.query(procedure(byId))
  })

  it('a scope declaring nothing reads `unknown` and mounts on any procedure', () => {
    const anyInput = scope(carrier()).step(async (_app: {}, { input }) => {
      expectTypeOf(input).toEqualTypeOf<unknown>()
      return 'ok'
    })

    t.procedure.query(procedure(anyInput))
    t.procedure.input((v: unknown) => v as { id: string }).query(procedure(anyInput))
  })

  it('`.output(schema)` checks the leaf\'s value, since the resolver\'s return survives', () => {
    t.procedure
      .input((v: unknown) => v as { id: string })
      .output((v: unknown) => v as string)
      .query(procedure(byId))
  })
})

describe('the mount owes the scope its chain: `DepGuard` rides `middleware`', () => {
  // `procedure` gets this verdict for free — its plain `(app, args) => R` shape
  // puts the deps under contravariance — so what is pinned here is the other
  // mount, where a `Scope<S>` argument gives contravariance nothing to bite on
  // and the gate is written out.
  const { carrier, middleware } = trpc(t, {})
  const needsDb = scope(carrier()).step(async ({ db }: { readonly db: string }) => db)

  it('refuses a scope the curried chain does not satisfy', () => {
    // @ts-expect-error __ERROR_chain_Pub_missing_deps
    middleware(needsDb)
  })

  it('accepts it on a chain that does — a superset passes, as everywhere', () => {
    trpc(t, { db: 'pg', extra: 1 }).middleware(needsDb)
  })
})

describe('a middleware may not derive a ctx key the run itself brought', () => {
  it('refuses it: `toNext` strips those by name before `next({ ctx })`', () => {
    const { carrier, middleware } = trpc(t, {})

    // The plausible one: a step that parses the raw input and populates it
    // under the same name. It would never reach the procedure downstream.
    const reparses = scope(carrier()).step(
      async (_app: {}, _ctx, next: Next<{ input: { id: string } }>) =>
        next({ input: { id: 'p1' } }),
    )

    // @ts-expect-error ⛔ this middleware derives a ctx key the run itself brought: input
    middleware(reparses)
  })
})
