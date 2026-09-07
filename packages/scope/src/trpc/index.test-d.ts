import { initTRPC } from '@trpc/server'
import type { inferRouterOutputs } from '@trpc/server'
import { describe, expectTypeOf, it } from 'vitest'
import { scope, type Next } from '../index.ts'
import { trpc } from './index.ts'
import { guards } from '../guard/index.ts'
import { z } from 'zod'
import { honoCarrier } from '../hono/index.ts'

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

describe('what `.input(schema)` supplies against what the scope VALIDATES', () => {
  const { carrier, procedure } = trpc(t, {})

  // The scope says what it reads of the input ONCE, in the schema — the same
  // shape the two pattern hosts use for their params (§53). `procedure` puts
  // that in the resolver's parameter, so the check below is tRPC's own
  // contravariance and no gate of ours.
  //
  // ONE SCHEMA VALUE, used twice: `.input(Id)` is what tRPC validates with, and
  // `.validate('input', Id, …)` is what types it inside the steps. Two
  // references to one constant, not two declarations to keep aligned.
  const Id = z.object({ id: z.string() })

  const byId = scope(carrier())
    .extend(guards)
    .step(async (_app: {}, _ctx, next: Next<{ seen: true }>) => next({ seen: true }))
    .validate('input', Id, () => null)
    .step(async (_app: {}, { input }) => {
      expectTypeOf(input).toEqualTypeOf<{ id: string }>()
      return input.id
    })

  it('accepts a procedure whose schema supplies it', () => {
    t.procedure.input(Id).query(procedure(byId))
  })

  it('refuses a procedure whose schema supplies something else', () => {
    // @ts-expect-error — the schema supplies `slug`, the scope validated `id`:
    // the resolver is handed the schema's output, so contravariance refuses it
    t.procedure.input(z.object({ slug: z.string() })).query(procedure(byId))
  })

  it('refuses a procedure with no input at all', () => {
    // A procedure without `.input()` hands its resolver `input: undefined`, so
    // this is the same refusal as a mismatched schema rather than a special
    // case: nothing supplies the `id` this scope validated.
    // @ts-expect-error
    t.procedure.query(procedure(byId))
  })

  it('a scope validating nothing reads `unknown` and mounts on any procedure', () => {
    const anyInput = scope(carrier()).step(async (_app: {}, { input }) => {
      expectTypeOf(input).toEqualTypeOf<unknown>()
      return 'ok'
    })

    t.procedure.query(procedure(anyInput))
    t.procedure.input(Id).query(procedure(anyInput))
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

describe('`middleware` takes a scope written for ITS carrier, and no other', () => {
  it('refuses a scope written for another host', () => {
    const { middleware } = trpc(t, {})
    const forHono = scope(honoCarrier()).step(async (_app: {}, { c }) => c.json({}))

    // @ts-expect-error — this scope reads `c`; a tRPC run brings input and ctx
    middleware(forHono)
  })

  it('states the CONTEXT and leaves `input` alone', () => {
    // The gate says what a run brings — the app's context, typed, and a raw
    // `unknown` input. What a scope reads OF the input is the RESOLVER's
    // parameter's business, over on `procedure`.
    const { carrier, middleware } = trpc(t, {})

    middleware(
      scope(carrier()).step(async (_app: {}, ctx, next: Next<{ found: string }>) => {
        expectTypeOf(ctx.input).toEqualTypeOf<unknown>()
        return next({ found: ctx.ctx.tenant })
      }),
    )
  })

  it('REFUSES a middleware that validates the input — the leaf would strip it', () => {
    // A LIMIT WORTH NAMING, and it falls out of `StripGate` rather than being
    // written for this: `validate('input', …)` replaces the `input` entry, and
    // a middleware's leaf strips `input` by name before `next({ ctx })`, so the
    // narrowed value would never reach the procedure downstream. On `procedure`
    // the same call is the whole mechanism; here it has nowhere to go, and a
    // middleware that must read the input narrows it by hand.
    const { carrier, middleware } = trpc(t, {})

    const narrowsInput = scope(carrier())
      .extend(guards)
      .validate('input', z.object({ id: z.string() }), () => null)
      .step(async (_app: {}, ctx, next: Next<{ found: string }>) => next({ found: ctx.input.id }))

    // @ts-expect-error ⛔ this middleware derives a ctx key the run itself brought: input
    middleware(narrowsInput)
  })
})
