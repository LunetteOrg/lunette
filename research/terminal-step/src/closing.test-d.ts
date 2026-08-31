import { describe, expectTypeOf, it } from 'vitest'
import { authorize, enrich, leaf, scope, type Handler, type Outcome } from './kernel.ts'

// THE QUESTION: does `.step()` alone close the builder, when what it is given
// declares that it terminates?

describe('a step that does not declare it closes', () => {
  it('leaves the builder open, and it is still not callable', () => {
    const open = scope().step(enrich(() => ({ a: 1 })))
    expectTypeOf(open.step).toBeFunction()
    // @ts-expect-error — still a builder: nothing has closed it
    open({})
  })
})

// The distinction the whole design rests on: ENDING THE FOLD and CLOSING THE
// BUILDER are different claims. An authorization does the first at runtime and
// must not do the second, or a scope would stop accepting its own leaf.
describe('a step that may stop the fold but does not declare it closes', () => {
  it('leaves the builder open, exactly like one that always continues', () => {
    // `authorize` takes the app as `object`: this prototype does not model dep
    // accumulation, only closure, so a step's deps are read with a cast the way
    // a raw step's are in the real package.
    const open = scope().step(
      authorize((app: object) => (app as { admin?: boolean }).admin === true && { who: 'admin' }),
    )
    expectTypeOf(open.step).toBeFunction()
    // @ts-expect-error — it can END a request, but it has not CLOSED the scope
    open({ admin: true })
  })

  it('still reaches the callable once a terminal step follows', () => {
    const closed = scope()
      .step(authorize(() => ({ who: 'admin' })))
      .step(leaf((_app: {}, ctx) => (ctx as { who: string }).who))
    expectTypeOf(closed).toMatchTypeOf<Handler<{}, string>>()
  })
})

describe('a step that DOES declare it closes', () => {
  it('turns the builder into the callable, with R read off the leaf', () => {
    const closed = scope()
      .step(enrich(() => ({ a: 1 })))
      .step(leaf((_app: {}, _ctx) => ({ title: 'hello' })))

    expectTypeOf(closed).toMatchTypeOf<Handler<{}, { title: string }>>()
    expectTypeOf(closed).toBeCallableWith({})
  })

  it('accumulates the leaf`s declared deps into what the call demands', () => {
    const closed = scope().step(leaf((app: { repo: { size: number } }) => app.repo.size))

    expectTypeOf(closed).toMatchTypeOf<Handler<{ repo: { size: number } }, number>>()
    // @ts-expect-error — the app must carry what the leaf declared
    closed({})
  })

  it('unwraps a promise, so an async leaf reads the same as a sync one', () => {
    const closed = scope().step(leaf(async () => ({ n: 1 })))
    expectTypeOf(closed).toMatchTypeOf<Handler<{}, { n: number }>>()
    expectTypeOf(closed({})).toEqualTypeOf<Promise<Outcome<{ n: number }>>>()
  })
})
