// The dev/HMR recipe: in dev the bootstrap MODULE may be re-evaluated
// (Vite's HMR) — and each evaluation would create a new chain and a new
// pool. The chain is not at fault: inside ONE run the singleton is
// structural; the problem here is that MULTIPLE runs are born. The
// recipe is host-level: memoize the build PROMISE on globalThis — that
// way even two concurrent evaluations share the same boot (memoizing
// the app, not the promise, leaves a race).
//
//   const g = globalThis as { __app?: ReturnType<typeof boot> }
//   const { app, dispose } = await (g.__app ??= chain.build(env))
//
// Variant for those who want fresh code on every hot update (teardown
// included): import.meta.hot?.dispose(() => dispose()) and no memo.

import { describe, expect, it } from 'vitest'
import { lunette } from './index.ts'

describe('the HMR recipe: memoizing the build promise', () => {
  it('three "module evaluations" (even concurrent), a single boot', async () => {
    let boots = 0
    const makeChain = () =>
      lunette()
        .provide('db', () => {
          boots += 1
          return { pool: 'open' }
        })
        .expose('api', ({ db }) => ({ status: () => db.pool }))

    // the dev process's fake globalThis
    const g: { __app?: ReturnType<ReturnType<typeof makeChain>['build']> } = {}

    // the line that would live in the server entry
    const moduleInit = () => (g.__app ??= makeChain().build())

    const [first, second] = await Promise.all([moduleInit(), moduleInit()])
    const third = await moduleInit() // the "re-evaluation" after a hot update

    expect(first.app).toBe(second.app)
    expect(second.app).toBe(third.app)
    expect(boots).toBe(1) // one pool for N evaluations of the module
  })
})
