// LOAD-BEARING RPC PROOF for the tRPC host: the scope → tRPC procedure
// preserves a fully typed AppRouter and caller END TO END — the procedure's
// INPUT is the schema type and its awaited OUTPUT is the leaf type, inferred, on
// both the router inference helpers (what a typed client reads) and a concrete
// createCaller<AppRouter>. If this file stops compiling, the pack has lost RPC.

import { initTRPC } from '@trpc/server'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'
import { expectTypeOf } from 'vitest'
import { z } from 'zod'
import { forbidden, unauthorized } from '@lntt/scope/trpc'
import { makeRepos, type Admin, type Session } from './fixture/domain.ts'
import { guard, leaf, type InputOf } from '../src/trpc.ts'

type App = ReturnType<typeof makeRepos>
const t = initTRPC.context<App>().create()

const echoInput = z.object({ courseId: z.string(), take: z.number().optional() })
type EchoIn = InputOf<typeof echoInput> // derived from the SAME schema tRPC validates
interface EchoOut {
  readonly id: string
  readonly count: number
}

const proc = t.procedure
  .input(echoInput)
  .use(
    guard<App, EchoIn, { session: Session }>((d) => {
      const s = d.sessionRepo.get(new Request('http://x/'))
      return s ? { session: s } : unauthorized()
    }),
  )
  .use(
    guard<App & { session: Session }, EchoIn, { admin: Admin }>((d) => {
      // ── ACCUMULATION PROOF: this guard sees `session` from the prior .use ──
      expectTypeOf(d.session).toEqualTypeOf<Session>()
      const a = d.adminRepo.byId(d.session.userId)
      return a ? { admin: a } : forbidden()
    }),
  )
  .query(
    leaf<App & { session: Session; admin: Admin }, EchoIn, EchoOut>((d) => {
      // ── RESOLVER PROOF: leaf sees input + BOTH accumulated enrichments ──
      expectTypeOf(d.input).toEqualTypeOf<EchoIn>()
      expectTypeOf(d.session).toEqualTypeOf<Session>()
      expectTypeOf(d.admin).toEqualTypeOf<Admin>()
      return { id: d.admin.id, count: d.input.take ?? 0 }
    }),
  )

const appRouter = t.router({ courses: t.router({ echo: proc }) })
type AppRouter = typeof appRouter

// ── RPC PROOF #1: router inference helpers (what a typed client reads) ──────
type Inputs = inferRouterInputs<AppRouter>
type Outputs = inferRouterOutputs<AppRouter>
expectTypeOf<Inputs['courses']['echo']>().toEqualTypeOf<{
  courseId: string
  take?: number | undefined
}>()
expectTypeOf<Outputs['courses']['echo']>().toEqualTypeOf<EchoOut>()

// ── RPC PROOF #2: a concrete typed caller — input + AWAITED output end to end ─
const createCaller = t.createCallerFactory(appRouter)
declare const caller: ReturnType<typeof createCaller>
expectTypeOf(caller.courses.echo).parameter(0).toEqualTypeOf<{
  courseId: string
  take?: number | undefined
}>()
expectTypeOf(caller.courses.echo).returns.resolves.toEqualTypeOf<EchoOut>()

// ── LOAD-BEARING NEGATIVES (removing any @ts-expect-error must break typecheck) ─

// The caller REJECTS a wrong input shape (schema type flows to the client).
// @ts-expect-error courseId must be a string, not a number
void caller.courses.echo({ courseId: 123 })

// The awaited output is EchoOut, NOT some other shape.
// @ts-expect-error output has no `title` field
expectTypeOf(caller.courses.echo).returns.resolves.toEqualTypeOf<{ title: string }>()

// A guard CANNOT read an enrichment that a LATER guard produces — order-correct.
t.procedure.input(echoInput).use(
  guard<App, EchoIn, { session: Session }>((d) => {
    // @ts-expect-error `admin` is not in ctx yet at the first guard
    void d.admin
    return { session: d.sessionRepo.get(new Request('http://x/'))! }
  }),
)

// The enrichment a guard returns must be an object matching its declared E.
t.procedure.input(echoInput).use(
  // @ts-expect-error a bare string is neither an enrichment object nor an Abort
  guard<App, EchoIn, { session: Session }>(() => 'nope'),
)
