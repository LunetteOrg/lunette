import { describe, expectTypeOf, it } from 'vitest'
import { bind, window, type With } from './index.ts'

declare const atomic: unique symbol
type Tx<D> = D & { readonly [atomic]: true }

type DbHandle = { mode: 'live' | 'tx'; query: (sql: string) => Promise<string[]> }

declare const db: DbHandle & {
  transaction: <T>(fn: (tx: DbHandle) => Promise<T>) => Promise<T>
}
declare const inTx: With<{ db: Tx<DbHandle> }>
declare const inTxWithEmail: With<{
  db: Tx<DbHandle>
  email: { send: (to: string) => Promise<void> }
}>
declare const emailOnly: With<{ email: { send: (to: string) => Promise<void> } }>

const whereAmI = async ({ db: h }: { db: DbHandle }) => h.mode
const verifyOtp = async ({ db: h }: { db: Tx<DbHandle> }, email: string) => ({
  session: email,
  on: h.mode,
})

describe('With/bind (types)', () => {
  it('the brand in the type blocks wiring outside a transaction', () => {
    // @ts-expect-error — verifyOtp demands Tx<DbHandle>: fixed deps are not enough
    bind({ verifyOtp })({ db })

    bind({ verifyOtp }).with(inTx) // the transactional window is the only way
    bind({ whereAmI }).with(inTx) // a Tx<DbHandle> IS a DbHandle: allowed
  })

  it('.with promisifies; the applied binder preserves sync returns', () => {
    const sync = ({ db: h }: { db: DbHandle }, n: number) => h.mode.length + n

    const fixed = bind({ sync })({ db })
    expectTypeOf(fixed.sync).toEqualTypeOf<(n: number) => number>()

    const win: With<{ db: DbHandle }> = (use) => use({ db })
    const perCall = bind({ sync }).with(win)
    expectTypeOf(perCall.sync).toEqualTypeOf<(n: number) => Promise<number>>()
  })

  it('the atomicity requirement PROPAGATES through composition', () => {
    // the composite passes its own deps to the bare leaf → inherits Tx<>
    const placeOrder = async (deps: { db: Tx<DbHandle> }, email: string) =>
      verifyOtp(deps, email)

    // @ts-expect-error — the composite too is wired only with the window
    bind({ placeOrder })({ db })

    bind({ placeOrder }).with(inTx)
  })

  it('a heterogeneous record demands the INTERSECTION from the window', () => {
    const onlyDb = async ({ db: h }: { db: Tx<DbHandle> }) => h.mode
    const both = async (
      _deps: { db: Tx<DbHandle>; email: { send: (to: string) => Promise<void> } },
      _to: string,
    ) => 'ok' as const

    // a window lending only db does not cover `both`
    // @ts-expect-error — the record's deps include email: this window lends too little
    bind({ onlyDb, both }).with(inTx)

    bind({ onlyDb, both }).with(inTxWithEmail)
  })

  it('window() infers Raw from the bridge and Deps from its return', () => {
    const w = window(db.transaction, (tx: DbHandle) => ({
      db: tx as Tx<DbHandle>,
    }))

    expectTypeOf(w).toEqualTypeOf<With<{ db: Tx<DbHandle> }>>()
  })

  it('.by: the key is typed on the bound call, absent from the leaf', () => {
    const report = async ({ db: h }: { db: DbHandle }, period: string) =>
      `${h.mode}:${period}`

    const { report: monthly } = bind({ report }).by((_tenant: string) =>
      window(db.transaction, (tx: DbHandle) => ({ db: tx })),
    )

    // key first (its type comes from toWindow), then the leaf's own args
    expectTypeOf(monthly).toEqualTypeOf<
      (key: string, period: string) => Promise<string>
    >()

    // @ts-expect-error — the key must match toWindow's parameter type
    monthly(42, '2026-06')

    // the derived window must still lend the record's deps intersection
    // (lending MORE is fine — With is covariant enough for width)
    bind({ whereAmI }).by((_tenant: string) => inTxWithEmail)

    // @ts-expect-error — this recipe does not lend the db the leaf declares
    bind({ report }).by((_tenant: string) => emailOnly)
  })
})
