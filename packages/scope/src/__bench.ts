import { scope } from './scope.ts'
import { fixture, refused, elsewhere } from './fixture/carrier.ts'
import type { Next } from './step.ts'
const w = (n: number) => async (_a: {}, _c: {}, next: Next<Record<`k${number}`, number>>) =>
  n % 3 === 0 ? refused('x') : n % 5 === 0 ? elsewhere('/y') : next({ [`k${n}`]: n } as never)
export const bench = scope(fixture)
  .step(w(1)).step(w(2)).step(w(3)).step(w(4)).step(w(5))
  .step(w(6)).step(w(7)).step(w(8)).step(w(9)).step(w(10))
  .step(w(11)).step(w(12)).step(w(13)).step(w(14)).step(w(15))
  .step(w(16)).step(w(17)).step(w(18)).step(w(19)).step(w(20))
  .step(async (_a: {}, _c: {}) => 'leaf')
