import { describe, expectTypeOf, it } from 'vitest'
import { lunette } from '../../src/index.ts'
// Real message types: imported so the contract cannot drift from the
// text chain.ts actually prints (type-only, not on the public surface).
import type {
  AnyCtxMsg,
  AnyPatchMsg,
  MissingKeyMsg,
  NeverPatchMsg,
  NumKeyMsg,
} from '../../src/chain.ts'

declare const bugSym: unique symbol
declare const anyValue: any

describe('override (types)', () => {
  it('may change the type of the replaced key, visibility preserved', async () => {
    const app = await lunette()
      .expose(() => ({ db: { url: 'pg://real' } }))
      .override(() => ({ db: { fake: true } }))
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{ db: { fake: boolean } }>()
  })

  it('overriding a private key does not publish it', async () => {
    const app = await lunette()
      .provide(() => ({ secret: 'v1' }))
      .expose(() => ({ api: { v: 1 } }))
      .override(() => ({ secret: 'v2' }))
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{ api: { v: number } }>()

    // @ts-expect-error — secret stays private even after the override
    app.secret
  })

  it('a typo in the key name blocks the chain', () => {
    const chain = lunette()
      .provide(() => ({ db: 1 }))
      .override(() => ({ bd: 2 }))

    // still a return-type guard (see #25: only the collision guard moved
    // onto the argument): ASCII property name, emoji in the message value
    expectTypeOf(chain).toEqualTypeOf<{ override: MissingKeyMsg<'bd'> }>()

    // the one literal-text pin for the message family (the other
    // assertions ride the imported type, which cannot drift)
    expectTypeOf<MissingKeyMsg<'bd'>>().toEqualTypeOf<'⛔ overriding key missing from the context: bd'>()

    // @ts-expect-error — no continuing on the error type
    chain.run(async () => {})
  })

  // The message must route through KeyLabel: a `${K & string}`
  // interpolation collapses the whole template to never for a symbol
  // key — the chain would still stop, but the text would be silently
  // lost.
  it('a symbol key missing from the context is labelled in the message', () => {
    const chain = lunette()
      .provide(() => ({ db: 1 }))
      .override(() => ({ [bugSym]: 2 }))

    expectTypeOf(chain).toEqualTypeOf<{
      override: MissingKeyMsg<typeof bugSym>
    }>()
  })

  // Decision 30 reaches override too: numbers are not keys anywhere. A
  // numeric slot can only pre-exist via a declared Seed or a cast (the
  // decision's residual), and replacing it would re-type a slot whose
  // identity already lies (42 vs "42") — refused instead.
  it('a numeric key is refused even when the numeric slot exists', () => {
    const chain = lunette<{ 42: string }>().override(() => ({ 42: 'still' }))

    expectTypeOf(chain).toEqualTypeOf<{
      override: '⛔ numeric key not supported (it becomes a string at runtime): 42'
    }>()
  })

  it('a numeric key and a typo report together, as one union', () => {
    const chain = lunette<{ 42: string }>()
      .provide(() => ({ db: 1 }))
      .override(() => ({ 42: 'x', bd: 2 }))

    expectTypeOf(chain).toEqualTypeOf<{
      override: NumKeyMsg<42> | MissingKeyMsg<'bd'>
    }>()
  })

  // An any PATCH falling through to the verdict would report the
  // artifacts of a degraded input as if they were real findings —
  // '⛔ numeric key not supported: ${number}' | '⛔ overriding key
  // missing: ${string}' — factually wrong on both counts. Unlike the
  // sibling brands (argument position, where any absorbs everything and
  // honesty must wait one line), this guard sits on the RETURN type: it
  // CAN refuse the any patch at its own line, by name.
  it('an any patch is refused by name, at its own line', () => {
    const chain = lunette()
      .provide(() => ({ db: 1 }))
      .override(() => anyValue)

    expectTypeOf(chain).toEqualTypeOf<{ override: AnyPatchMsg }>()
  })

  it('an any context still wins the blame when both are any', () => {
    const chain = lunette<any>().override(() => anyValue)

    expectTypeOf(chain).toEqualTypeOf<{ override: AnyCtxMsg }>()
  })

  // A WIDENED patch annotation (an index signature claims every string
  // key) must not trip a false positive — Exclude<string, 'db'> does
  // not reduce, so an unfiltered check would read every
  // actually-existing key as "missing". Widened types are the runtime
  // net's territory (same convention as the widened key on the keyed
  // verbs, decisions §4): the guard steps aside instead of inventing a
  // missing key.
  it("a widened patch annotation flows: the runtime net's territory", () => {
    const chain = lunette()
      .provide(() => ({ db: 1 as unknown }))
      .override((ctx): Record<string, unknown> => ({ ...ctx, db: 2 }))

    expectTypeOf(chain.run).toBeFunction()
  })

  // The widened convention is UNIFORM across key kinds — symbol and
  // template-literal patterns step aside exactly like string index
  // signatures. The filter is member-wise: a key type Record can
  // satisfy by omission ({} extends Record<K, 1>) names nothing
  // concrete and is dropped; literals, numbers and unique symbols stay.
  it('a symbol-record widened patch flows too', () => {
    const chain = lunette()
      .provide(() => ({ [bugSym]: 1 as unknown }))
      .override((): Record<symbol, unknown> => ({ [bugSym]: 2 }))

    expectTypeOf(chain.run).toBeFunction()
  })

  it('a template-literal-record widened patch flows too', () => {
    const chain = lunette()
      .provide(() => ({ 'data-db': 1 as unknown }))
      .override((): Record<`data-${string}`, unknown> => ({ 'data-db': 2 }))

    expectTypeOf(chain.run).toBeFunction()
  })

  it('a numeric-record patch reports ONLY the numeric ban, no phantom missing', () => {
    const chain = lunette()
      .provide(() => ({ db: 1 }))
      .override((): Record<number, unknown> => ({ 42: 2 }))

    expectTypeOf(chain).toEqualTypeOf<{ override: NumKeyMsg<number> }>()
  })

  // A NEVER patch (a throw-only stub — plausible while developing) must
  // not be blamed as "degraded to any": never is not any, and it gets
  // its own verdict, at its own line (return position can).
  it('a never patch is refused by name, not blamed as any', () => {
    const chain = lunette()
      .provide(() => ({ db: 1 }))
      .override(() => {
        throw new Error('todo')
      })

    expectTypeOf(chain).toEqualTypeOf<{ override: NeverPatchMsg }>()
  })
})
