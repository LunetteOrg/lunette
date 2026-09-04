import { initTRPC } from '@trpc/server'
import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '../index.ts'
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

    scope(carrier).step(async (_app: {}, ctx) => {
      expectTypeOf(ctx.ctx).toEqualTypeOf<Context>()
      expectTypeOf(ctx.input).toEqualTypeOf<unknown>()
      return ctx.ctx.tenant
    })
  })

  it('refuses a step that reads a key the context does not have', () => {
    const { carrier } = trpc(t, {})

    // @ts-expect-error — `region` is not on this app's context
    scope(carrier).step(async (_app: {}, ctx) => ctx.ctx.region)
  })

  it('fails CLOSED on something that is not a tRPC builder: the ctx is `never`', () => {
    const { carrier } = trpc({ not: 'a builder' }, {})

    // @ts-expect-error — nothing is readable off a `never` context, so a
    // mistyped first argument stops here rather than widening to `{}`
    scope(carrier).step(async (_app: {}, ctx) => ctx.ctx.actorId)
  })
})
