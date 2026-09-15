import { describe, expectTypeOf, it } from 'vitest'
import { bind, lease, type Lease } from '@lntt/wire'

declare const atomic: unique symbol
type Tx<D> = D & { readonly [atomic]: true }

type DbHandle = {
  mode: 'live' | 'tx'
  query: (sql: string) => Promise<string[]>
}

declare const db: DbHandle & {
  transaction: <T>(fn: (tx: DbHandle) => Promise<T>) => Promise<T>
}
declare const inTx: Lease<{ db: Tx<DbHandle> }>
declare const inTxWithEmail: Lease<{
  db: Tx<DbHandle>
  email: { send: (to: string) => Promise<void> }
}>
declare const emailOnly: Lease<{
  email: { send: (to: string) => Promise<void> }
}>

const whereAmI = async ({ db: h }: { db: DbHandle }) => h.mode
const verifyOtp = async ({ db: h }: { db: Tx<DbHandle> }, email: string) => ({
  session: email,
  on: h.mode,
})

describe('Lease/bind (types)', () => {
  it('the brand in the type blocks wiring outside a transaction', () => {
    // @ts-expect-error — verifyOtp demands Tx<DbHandle>: fixed deps are not enough
    bind({ verifyOtp })({ db })

    bind({ verifyOtp }).with(inTx) // the transactional lease is the only way
    bind({ whereAmI }).with(inTx) // a Tx<DbHandle> IS a DbHandle: allowed
  })

  it('.with promisifies; the applied binder preserves sync returns', () => {
    const sync = ({ db: h }: { db: DbHandle }, n: number) => h.mode.length + n

    const fixed = bind({ sync })({ db })
    expectTypeOf(fixed.sync).toEqualTypeOf<(n: number) => number>()

    const lent: Lease<{ db: DbHandle }> = (use) => use({ db })
    const perCall = bind({ sync }).with(lent)
    expectTypeOf(perCall.sync).toEqualTypeOf<(n: number) => Promise<number>>()
  })

  it('the atomicity requirement PROPAGATES through composition', () => {
    // the composite passes its own deps to the bare leaf → inherits Tx<>
    const placeOrder = async (deps: { db: Tx<DbHandle> }, email: string) =>
      verifyOtp(deps, email)

    // @ts-expect-error — the composite too is wired only with the lease
    bind({ placeOrder })({ db })

    bind({ placeOrder }).with(inTx)
  })

  it('a heterogeneous record demands the INTERSECTION from the lease', () => {
    const onlyDb = async ({ db: h }: { db: Tx<DbHandle> }) => h.mode
    const both = async (
      _deps: {
        db: Tx<DbHandle>
        email: { send: (to: string) => Promise<void> }
      },
      _to: string,
    ) => 'ok' as const

    // a lease lending only db does not cover `both`
    // @ts-expect-error — the record's deps include email: this lease lends too little
    bind({ onlyDb, both }).with(inTx)

    bind({ onlyDb, both }).with(inTxWithEmail)
  })

  it('lease() infers Raw from the bridge and Deps from its return', () => {
    const l = lease(db.transaction, (tx: DbHandle) => ({
      db: tx as Tx<DbHandle>,
    }))

    expectTypeOf(l).toEqualTypeOf<Lease<{ db: Tx<DbHandle> }>>()
  })

  it('.by: the key is typed on the bound call, absent from the leaf', () => {
    const report = async ({ db: h }: { db: DbHandle }, period: string) =>
      `${h.mode}:${period}`

    const { report: monthly } = bind({ report }).by((_tenant: string) =>
      lease(db.transaction, (tx: DbHandle) => ({ db: tx })),
    )

    // key first (its type comes from toLease), then the leaf's own args
    expectTypeOf(monthly).toEqualTypeOf<
      (key: string, period: string) => Promise<string>
    >()

    // @ts-expect-error — the key must match toLease's parameter type
    monthly(42, '2026-06')

    // the derived lease must still lend the record's deps intersection
    // (lending MORE is fine — Lease is covariant enough for width)
    bind({ whereAmI }).by((_tenant: string) => inTxWithEmail)

    // @ts-expect-error — this recipe does not lend the db the leaf declares
    bind({ report }).by((_tenant: string) => emailOnly)
  })
})
