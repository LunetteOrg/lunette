// LOAD-BEARING RPC PROOF for `toProcedure`: consuming a whole scope Handler
// in ONE call — with ZERO annotations — still preserves a fully typed caller.
// The procedure's INPUT is inferred from the scope's schema and its awaited
// OUTPUT from the leaf's R. If this file stops compiling, `toProcedure` has lost
// RPC inference.

import { initTRPC } from '@trpc/server'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { scope } from '@lntt/scope'
import { body } from '@lntt/scope/body'
import { courseHandlerRpc } from './fixture/handlers.ts'
import type { App } from './fixture/chain.ts'
import { toMutation, toProcedure } from '../src/trpc.ts'

type Ctx = App & { request: Request }
const t = initTRPC.context<Ctx>().create()
const appRouter = t.router({ courses: t.router({ get: toProcedure(t.procedure, courseHandlerRpc) }) })

describe('toProcedure — typed client preserved, zero annotations', () => {
  it('infers input (schema) and output (leaf R)', async () => {
    const caller = t.createCallerFactory(appRouter)({} as Ctx)
    expectTypeOf(caller.courses.get).parameter(0).toEqualTypeOf<{ courseId: string }>()
    const out = await caller.courses.get({ courseId: 'c1' })
    expectTypeOf(out).toEqualTypeOf<{ id: string; title: string }>()
  })
})

describe('toMutation — a write procedure, typed client preserved, gate holds', () => {
  const mutationRouter = t.router({
    courses: t.router({ create: toMutation(t.procedure, courseHandlerRpc) }),
  })

  it('infers input (schema) and output (leaf R) on a mutation', async () => {
    const caller = t.createCallerFactory(mutationRouter)({} as Ctx)
    expectTypeOf(caller.courses.create).parameter(0).toEqualTypeOf<{ courseId: string }>()
    const out = await caller.courses.create({ courseId: 'c1' })
    expectTypeOf(out).toEqualTypeOf<{ id: string; title: string }>()
  })

  it('a .body scope cannot mount as a mutation either — the gate applies', () => {
    const writeFrag = scope().extend(body)
      .body(z.object({ x: z.string() }))
      .handle((_d: {}, ctx) => ({ x: ctx.body.x }))
    // @ts-expect-error host missing capability 'body' — the gate applies to toMutation too
    toMutation(t.procedure, writeFrag)
  })
})
