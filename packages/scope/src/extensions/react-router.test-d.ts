import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '../scope.ts'
import type { RequestHead } from '../carrier.ts'
import { data, reactRouter, redirect } from './react-router.ts'

describe('reactRouter — read-only ctx.request, no Abort/Ok vocabulary of its own', () => {
  it('adds `ctx.request`, typed the same as every other carrier', () => {
    scope(reactRouter)
      .guard((_app: {}, ctx) => {
        expectTypeOf(ctx.request).toEqualTypeOf<RequestHead>()
        return {}
      })
  })

  it('re-exports RR7 own data()/redirect() — the escape hatch a leaf may speak directly', () => {
    expectTypeOf(data).toBeFunction()
    expectTypeOf(redirect).toBeFunction()
  })
})
