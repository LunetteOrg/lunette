import { describe, expectTypeOf, it } from 'vitest'
import { bind, within, type With } from './index.ts'

declare const atomic: unique symbol
type Tx<D> = D & { readonly [atomic]: true }

type DbHandle = { mode: 'live' | 'tx'; query: (sql: string) => Promise<string[]> }

declare const db: DbHandle & {
  transaction: <T>(fn: (tx: DbHandle) => Promise<T>) => Promise<T>
}
declare const inTx: With<{ db: Tx<DbHandle> }>

const whereAmI = async ({ db: h }: { db: DbHandle }) => h.mode
const verifyOtp = async ({ db: h }: { db: Tx<DbHandle> }, email: string) => ({
  session: email,
  on: h.mode,
})

describe('With/bind (types)', () => {
  it('the brand in the type blocks wiring outside a transaction', () => {
    // @ts-expect-error — verifyOtp demands Tx<DbHandle>: fixed deps are not enough
    bind({ db }, { verifyOtp })

    bind(inTx, { verifyOtp }) // the transactional window is the only way
    bind(inTx, { whereAmI }) // a Tx<DbHandle> IS a DbHandle: allowed
  })

  it('window form promisifies; value form preserves sync ones', () => {
    const sync = ({ db: h }: { db: DbHandle }, n: number) => h.mode.length + n

    const fixed = bind({ db }, { sync })
    expectTypeOf(fixed.sync).toEqualTypeOf<(n: number) => number>()

    const win: With<{ db: DbHandle }> = (use) => use({ db })
    const perCall = bind(win, { sync })
    expectTypeOf(perCall.sync).toEqualTypeOf<(n: number) => Promise<number>>()
  })

  it('the atomicity requirement PROPAGATES through composition', () => {
    // the composite passes its own deps to the bare leaf → inherits Tx<>
    const placeOrder = async (deps: { db: Tx<DbHandle> }, email: string) =>
      verifyOtp(deps, email)

    // @ts-expect-error — the composite too is wired only with the window
    bind({ db }, { placeOrder })

    bind(inTx, { placeOrder })
  })

  it('within infers Raw from the bridge and Deps from its return', () => {
    const w = within(db.transaction, (tx: DbHandle) => ({
      db: tx as Tx<DbHandle>,
    }))

    expectTypeOf(w).toEqualTypeOf<With<{ db: Tx<DbHandle> }>>()
  })
})
