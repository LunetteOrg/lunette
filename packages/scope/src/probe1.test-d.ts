import { expectTypeOf } from 'vitest'
import { scope, type ResultOf } from './scope.ts'
import type { Next } from './step.ts'

// LA SONDA DI STAMATTINA: index signature raffinata da un tipo concreto
const a = scope()
  .step(async (_app: {}, _ctx: {}, next: Next<Record<string, string>>) => next({ x: 'v' }))
  .step(async (_app: {}, ctx: { readonly page: number }) => ctx.page)
expectTypeOf<ResultOf<typeof a>>().toEqualTypeOf<number>()

// LA SONDA DI ADESSO: due tipi CONCRETI sulla stessa chiave
const b = scope()
  .step(async (_app: {}, _ctx: {}, next: Next<{ page: string }>) => next({ page: '3' }))
  .step(async (_app: {}, _ctx: {}, next: Next<{ page: number }>) => next({ page: 3 }))
  .step(async (_app: {}, ctx: { readonly page: never }) => ctx.page)
expectTypeOf<ResultOf<typeof b>>().toEqualTypeOf<never>()
