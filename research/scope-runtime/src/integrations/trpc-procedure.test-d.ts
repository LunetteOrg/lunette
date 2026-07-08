// LOAD-BEARING RPC PROOF for `toProcedure`: consuming a whole fragment Handler
// in ONE call — with ZERO annotations — still preserves a fully typed caller.
// The procedure's INPUT is inferred from the fragment's schema and its awaited
// OUTPUT from the leaf's R. If this file stops compiling, `toProcedure` has lost
// RPC inference.

import { initTRPC } from '@trpc/server'
import { describe, expectTypeOf, it } from 'vitest'
import { courseHandler } from '../example.ts'
import type { App } from '../chain.ts'
import { toProcedure } from './trpc.ts'

type Ctx = App & { request: Request }
const t = initTRPC.context<Ctx>().create()
const appRouter = t.router({ courses: t.router({ get: toProcedure(t.procedure, courseHandler) }) })

describe('toProcedure — typed client preserved, zero annotations', () => {
  it('infers input (schema) and output (leaf R)', async () => {
    const caller = t.createCallerFactory(appRouter)({} as Ctx)
    expectTypeOf(caller.courses.get).parameter(0).toEqualTypeOf<{ courseId: string }>()
    const out = await caller.courses.get({ courseId: 'c1' })
    expectTypeOf(out).toEqualTypeOf<{ id: string; title: string }>()
  })
})
