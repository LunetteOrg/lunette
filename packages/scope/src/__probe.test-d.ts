import { scope } from './scope.ts'
import type { Next } from './step.ts'
import { fixture, code, type Code } from './fixture/carrier.ts'

// C: word NOT coined by the carrier -> expect an error here
const u = scope(fixture).step((_app: {}, _ctx, _next: Next<{}>) => code(1) as Code)

// D: DepGuard — scope needs { db: string }, app misses it
const v = scope(fixture).step((_app: { db: string }, _ctx, _next: Next<{}>) => 'x')
void v({}, { token: null, params: {} })

// E: a step that decorates: awaits next and returns something of its own
const w = scope(fixture).step(async (_app: {}, _ctx, next: Next<{}>) => {
  const passed = await next({})
  return passed
})
void u
void w
