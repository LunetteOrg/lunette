import { describe, it } from 'vitest'
import { scope } from '../scope.ts'
import { forbidden as httpForbidden } from './http.ts'
import { forbidden, notFound, rpc } from './trpc.ts'

// The same gate `intent-vocabulary.test-d.ts` proves for `http`, on `rpc`'s
// own vocabulary — a different carrier, the same mechanism.

describe('an undeclared intent on the rpc carrier', () => {
  it('is rejected at the guard, naming the intent', () => {
    scope()
      // @ts-expect-error ⛔ this scope does not declare the intent: code
      .guard(() => notFound())
  })

  it('the cure is `.extend(rpc)`, and nothing else changes', () => {
    scope()
      .extend(rpc)
      .guard(() => forbidden())
      .handle(() => ({ ok: true }))
  })
})

// `http`'s words are a DIFFERENT vocabulary — extending `rpc` does not
// declare them, which is the whole point of a carrier owning its own words
// rather than sharing a "semantic" one.
describe('a carrier does not declare another carrier’s words', () => {
  it("rejects http's forbidden() on a scope that only extended rpc", () => {
    scope()
      .extend(rpc)
      // @ts-expect-error ⛔ this scope does not declare the intent: status
      .guard(() => httpForbidden())
  })
})
