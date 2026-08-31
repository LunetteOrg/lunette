import { describe, expect, it } from 'vitest'
import { authorize, enrich, leaf, scope } from './kernel.ts'

// The same machinery actually running, so the types are not the only evidence.
describe('the one-verb builder', () => {
  it('threads enrichments into the leaf and returns its value', async () => {
    const run = scope()
      .step(enrich(() => ({ a: 1 })))
      .step(enrich((_app, ctx) => ({ b: (ctx as { a: number }).a + 1 })))
      .step(leaf((_app: {}, ctx) => ctx as { a: number; b: number }))

    expect(await run({})).toEqual({ ok: true, value: { a: 1, b: 2 } })
  })

  it('reads the app the call was given', async () => {
    const run = scope().step(leaf((app: { repo: { size: number } }) => app.repo.size))
    expect(await run({ repo: { size: 3 } })).toEqual({ ok: true, value: 3 })
  })

  // The property the real design has to give up if it keeps `.handle`: here the
  // stack is complete on its own, with no terminal verb and no unreachable
  // trailing call.
  it('needs no closing verb at all', async () => {
    const run = scope().step(leaf(() => 'done'))
    expect(await run({})).toEqual({ ok: true, value: 'done' })
    expect(run.steps).toHaveLength(1)
  })
})

describe('an authorization step', () => {
  const run = scope()
    .step(authorize((app: object) => (app as { admin?: boolean }).admin === true && { who: 'admin' }))
    .step(leaf((_app: {}, ctx) => ({ seen: (ctx as { who: string }).who })))

  it('hands its enrichment inward when it lets the caller through', async () => {
    expect(await run({ admin: true })).toEqual({ ok: true, value: { seen: 'admin' } })
  })

  it('ends the fold without the leaf when it does not', async () => {
    expect(await run({ admin: false })).toEqual({ ok: false, value: undefined, error: 'denied' })
  })
})
