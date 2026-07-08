import { initTRPC } from '@trpc/server'
import { toProcedure } from '@lntt/integration/trpc'
import type { App } from './chain.ts'
import { courseHandler } from './handlers.ts'

// The tRPC host. `toProcedure` folds a whole fragment Handler into ONE native
// procedure in a single call, with ZERO annotations, and STILL preserves the
// typed `AppRouter` + `createCaller`/`createTRPCClient`. The carrier `request`
// rides in ctx; a RETURNED domain Abort becomes a THROWN TRPCError (4xx), an
// actual throw stays infrastructure (INTERNAL_SERVER_ERROR).
type Ctx = App & { request: Request }
const t = initTRPC.context<Ctx>().create()

export const appRouter = t.router({
  courses: t.router({ get: toProcedure(t.procedure, courseHandler) }),
})

export type AppRouter = typeof appRouter

export const createCaller = t.createCallerFactory(appRouter)
