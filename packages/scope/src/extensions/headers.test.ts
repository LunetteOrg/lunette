import { describe, expect, it } from 'vitest'
import { scope } from '../scope.ts'
import { headers, readHeaders, setHeaders } from './headers.ts'
import { runFold } from '../run-fold.ts'

const run = <R,>(handler: Parameters<typeof runFold>[0]) =>
  runFold<object, R>(handler, {}, {}, {})

describe('the headers extension', () => {
  it('applies `.headers({...})` declaratively, before the leaf runs', async () => {
    const s = scope()
      .extend(headers)
      .headers({ 'cache-control': 'public, max-age=60' })
      .handle(() => ({ feed: [] }))

    const out = await run<{ feed: never[] }>(s)
    expect(readHeaders(out).get('cache-control')).toBe('public, max-age=60')
    expect(out.ok && out.value).toEqual({ feed: [] })
  })

  it('leaves the leaf free of response concerns — the policy sits at the wiring', async () => {
    // The leaf is a plain domain function: it never sees `ctx.headers`, which is
    // the point of the declarative form.
    const leaf = () => ({ id: 'c1' })
    const s = scope().extend(headers).headers({ 'x-served-by': 'lntt' }).handle(leaf)

    const out = await run<{ id: string }>(s)
    expect(readHeaders(out).get('x-served-by')).toBe('lntt')
  })

  it('lets a GUARD write headers dynamically through the sink', async () => {
    const s = scope()
      .extend(headers)
      .guard((_deps: {}, ctx) => {
        ctx.headers.set('etag', 'W/"v1"')
        return {}
      })
      .handle(() => ({ ok: true }))

    const out = await run<{ ok: boolean }>(s)
    expect(readHeaders(out).get('etag')).toBe('W/"v1"')
  })

  it('appends rather than replaces when asked', async () => {
    const s = scope()
      .extend(headers)
      .guard((_deps: {}, ctx) => {
        ctx.headers.append('vary', 'accept')
        ctx.headers.append('vary', 'cookie')
        return {}
      })
      .handle(() => ({ ok: true }))

    const out = await run<{ ok: boolean }>(s)
    expect(readHeaders(out).get('vary')).toBe('accept, cookie')
  })

  it('takes its place in the guard chain where it is called', async () => {
    // The declarative step is an ordinary guard, so ORDER is the chain's order,
    // not a precedence rule. Policy first, then a guard that knows better —
    // e.g. a signed-in response that may only be cached privately.
    const policyFirst = scope()
      .extend(headers)
      .headers({ 'cache-control': 'no-store' })
      .guard((_deps: {}, ctx) => {
        ctx.headers.set('cache-control', 'private, max-age=30')
        return {}
      })
      .handle(() => ({ ok: true }))

    expect(readHeaders(await run<{ ok: boolean }>(policyFirst)).get('cache-control')).toBe(
      'private, max-age=30',
    )

    // …and the other way round, the declarative call wins, because it runs last.
    const policyLast = scope()
      .extend(headers)
      .guard((_deps: {}, ctx) => {
        ctx.headers.set('cache-control', 'private, max-age=30')
        return {}
      })
      .headers({ 'cache-control': 'no-store' })
      .handle(() => ({ ok: true }))

    expect(readHeaders(await run<{ ok: boolean }>(policyLast)).get('cache-control')).toBe('no-store')
  })

  it('says so when the sink is missing instead of dropping the headers', async () => {
    // Only reachable by hand-building a Handler without its `sinks` — which is
    // what a scope built through `.extend(headers)` can never produce.
    const handWired = {
      guards: [...(scope().extend(headers).headers({ 'x-a': '1' }).handle(() => ({})).guards ?? [])],
      prepare: [],
      leaf: () => ({ ok: true }),
    }

    await expect(runFold<object, { ok: boolean }>(handWired, {}, {}, {})).rejects.toThrow(
      /no headers sink on ctx/,
    )
  })

  it('composes the same step directly as a guard', async () => {
    // The exported form: identical behaviour, and the guard chain shows where
    // the policy runs. Useful when the same policy is shared between scopes.
    const policy = setHeaders({ 'cache-control': 'public, max-age=60' })

    const a = scope().extend(headers).guard(policy).handle(() => ({ ok: true }))
    const b = scope().extend(headers).headers({ 'cache-control': 'public, max-age=60' }).handle(() => ({ ok: true }))

    expect(readHeaders(await run<{ ok: boolean }>(a)).get('cache-control')).toBe(
      readHeaders(await run<{ ok: boolean }>(b)).get('cache-control'),
    )
  })
})
// The sink is created PER INVOCATION. Its twin in `cookies.test.ts` has always
// pinned this; without it here, hoisting the `Headers` into module scope — one
// bag shared by every request, so one caller's `x-user-id` rides on everyone
// else's response — passes the whole suite.
describe('the headers sink is per invocation', () => {
  const s = scope()
    .extend(headers)
    .handle((_deps: {}, ctx) => {
      ctx.headers.set('x-seen', 'yes')
      return { ok: true }
    })

  it('starts empty on every invocation', async () => {
    const first = await run<{ ok: boolean }>(s)
    expect([...readHeaders(first)]).toEqual([['x-seen', 'yes']])

    const second = await run<{ ok: boolean }>(s)
    // Exactly one, not two: the second run must not inherit the first.
    expect([...readHeaders(second)]).toEqual([['x-seen', 'yes']])
  })

  it('keeps concurrent runs of the SAME scope apart', async () => {
    const tagged = (tag: string) =>
      scope()
        .extend(headers)
        .handle(async (_deps: {}, ctx) => {
          ctx.headers.set('x-who', tag)
          await new Promise((r) => setTimeout(r, tag === 'slow' ? 20 : 0))
          return { ok: true }
        })

    const [slow, fast] = await Promise.all([
      run<{ ok: boolean }>(tagged('slow')),
      run<{ ok: boolean }>(tagged('fast')),
    ])
    expect([...readHeaders(slow)]).toEqual([['x-who', 'slow']])
    expect([...readHeaders(fast)]).toEqual([['x-who', 'fast']])
  })
})
