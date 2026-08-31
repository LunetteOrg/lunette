import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { forbidden, http } from './extensions/http.ts'
import { scope } from './scope.ts'
import { runScope } from './run-fold.ts'
import type { RequestCarrier } from './carrier.ts'

// The scope's schema drives runtime coercion + validation through `runScope`
// — the convenience the non-native hosts (RR7, Express, bus) use: validate →
// (the `invalid` outcome branch on failure) → fold. `.params` is `http`'s own
// input verb — the core has none (`§ the core coins no vocabulary`).
const params = z.object({ courseId: z.coerce.number(), tab: z.string().optional() })
const req = new Request('http://x/')

describe('http .params(schema) — runtime coercion + the invalid branch', () => {
  it('coerces "42" → 42 on success and hands the leaf the typed params', async () => {
    const h = scope()
      .extend(http)
      .params(params)
      .handle((_deps: {}, ctx) => ({ doubled: ctx.params.courseId * 2 }))

    const out = await runScope<RequestCarrier, typeof params, { doubled: number }>(
      h,
      {},
      { request: req },
      { courseId: '42' },
    )
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.value).toEqual({ doubled: 84 })
  })

  it('a validation failure is the RETURNED `invalid` branch, never a throw', async () => {
    const h = scope()
      .extend(http)
      .params(params)
      .handle((_deps: {}, ctx) => ({ id: ctx.params.courseId }))

    // "abc" cannot coerce to a number → the Standard-Schema validate reports
    // issues → the outcome's `invalid` branch, not an abort.
    const out = await runScope<RequestCarrier, typeof params, { id: number }>(
      h,
      {},
      { request: req },
      { courseId: 'abc' },
    )
    expect(out.ok).toBe(false)
    if (!out.ok && 'invalid' in out) expect(out.invalid.issues.length).toBeGreaterThan(0)
    else throw new Error('expected the invalid branch')
  })

  it('threads coerced params through guards; a guard abort short-circuits', async () => {
    const seen: number[] = []
    const h = scope()
      .extend(http)
      .params(params)
      .guard((_deps: {}, ctx) => {
        seen.push(ctx.params.courseId)
        return ctx.params.courseId > 0 ? { positive: true as const } : forbidden()
      })
      .handle((_deps: {}, ctx) => ({ courseId: ctx.params.courseId, positive: ctx.positive }))

    const ok = await runScope<RequestCarrier, typeof params, { courseId: number; positive: true }>(
      h,
      {},
      { request: req },
      { courseId: '7' },
    )
    expect(ok).toEqual({ ok: true, value: { courseId: 7, positive: true }, intent: undefined, effects: {} })
    expect(seen).toEqual([7]) // guard saw the coerced number, not "7"

    const denied = await runScope<RequestCarrier, typeof params, { courseId: number; positive: true }>(
      h,
      {},
      { request: req },
      { courseId: '0' },
    )
    expect(denied.ok).toBe(false)
    if (!denied.ok && 'abort' in denied) expect(denied.abort.intent).toMatchObject({ status: 403 })
    else throw new Error('expected an abort')
  })

  it('validation runs BEFORE any guard — a bad param never reaches the stack', async () => {
    let guardRan = false
    const h = scope()
      .extend(http)
      .params(params)
      .guard((_deps: {}, _ctx) => {
        guardRan = true
        return { ok: true as const }
      })
      .handle(() => ({ done: true }))

    const out = await runScope<RequestCarrier, typeof params, { done: boolean }>(
      h,
      {},
      { request: req },
      { courseId: 'not-a-number' },
    )
    expect(out.ok).toBe(false)
    expect(guardRan).toBe(false)
  })
})
