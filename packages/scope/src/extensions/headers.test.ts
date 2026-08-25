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