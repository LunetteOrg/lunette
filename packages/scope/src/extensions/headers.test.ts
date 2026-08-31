import { describe, expect, it } from 'vitest'
import { scope } from '../scope.ts'
import { headers, readHeaders } from './headers.ts'
import { runSteps, type Step } from '../fold.ts'
import { leafStep } from '../steps.ts'
import type { ScopeExtensionValue } from '../scope.ts'
import { http } from './http.ts'

// The seed: everything belonging to ONE invocation. `HostCaps` is named at each
// call — it is inferable from nothing, and naming it IS the host stating what
// machinery it has (§34), so a scope needing a capability cannot be run by a
// caller that never claimed it.
const seed = { request: new Request('http://x/'), params: {} }

describe('the headers extension', () => {
  it('applies `.headers({...})` declaratively, before the leaf runs', async () => {
    const s = scope(http)
      .extend(headers)
      .headers({ 'cache-control': 'public, max-age=60' })
      .handle(() => ({ feed: [] }))

    const out = await s<{}, 'response-headers'>({}, seed)
    expect(readHeaders(out).get('cache-control')).toBe('public, max-age=60')
    expect(out.ok && out.value).toEqual({ feed: [] })
  })

  it('leaves the leaf free of response concerns — the policy sits at the wiring', async () => {
    // The leaf is a plain domain function: it never sees `ctx.response.headers`, which is
    // the point of the declarative form.
    const leaf = () => ({ id: 'c1' })
    const s = scope(http).extend(headers).headers({ 'x-served-by': 'lntt' }).handle(leaf)

    const out = await s<{}, 'response-headers'>({}, seed)
    expect(readHeaders(out).get('x-served-by')).toBe('lntt')
  })

  it('lets a GUARD write headers dynamically through the sink', async () => {
    const s = scope(http)
      .extend(headers)
      .guard((_deps: {}, ctx) => {
        ctx.response.headers.set('etag', 'W/"v1"')
        return {}
      })
      .handle(() => ({ ok: true }))

    const out = await s<{}, 'response-headers'>({}, seed)
    expect(readHeaders(out).get('etag')).toBe('W/"v1"')
  })

  it('appends rather than replaces when asked', async () => {
    const s = scope(http)
      .extend(headers)
      .guard((_deps: {}, ctx) => {
        ctx.response.headers.append('vary', 'accept')
        ctx.response.headers.append('vary', 'cookie')
        return {}
      })
      .handle(() => ({ ok: true }))

    const out = await s<{}, 'response-headers'>({}, seed)
    expect(readHeaders(out).get('vary')).toBe('accept, cookie')
  })

  it('takes its place in the guard chain where it is called', async () => {
    // The declarative step is an ordinary guard, so ORDER is the chain's order,
    // not a precedence rule. Policy first, then a guard that knows better —
    // e.g. a signed-in response that may only be cached privately.
    const policyFirst = scope(http)
      .extend(headers)
      .headers({ 'cache-control': 'no-store' })
      .guard((_deps: {}, ctx) => {
        ctx.response.headers.set('cache-control', 'private, max-age=30')
        return {}
      })
      .handle(() => ({ ok: true }))

    expect(readHeaders(await policyFirst<{}, 'response-headers'>({}, seed)).get('cache-control')).toBe(
      'private, max-age=30',
    )

    // …and the other way round, the declarative call wins, because it runs last.
    const policyLast = scope(http)
      .extend(headers)
      .guard((_deps: {}, ctx) => {
        ctx.response.headers.set('cache-control', 'private, max-age=30')
        return {}
      })
      .headers({ 'cache-control': 'no-store' })
      .handle(() => ({ ok: true }))

    expect(readHeaders(await policyLast<{}, 'response-headers'>({}, seed)).get('cache-control')).toBe('no-store')
  })

  it('says so when the sink is missing instead of dropping the headers', async () => {
    // Only reachable by hand-building a Handler without its `sinks` — which is
    // what a scope built through `.extend(headers)` can never produce.
    // The verb's step alone, WITHOUT the collecting step the channel opens
    // beside it — which is what a scope built through `.extend(headers)` can
    // never produce. Reached through the SPI, since the step is not exported.
    const verb = (headers as unknown as ScopeExtensionValue).methods?.['headers'] as (
      values: Readonly<Record<string, string>>,
    ) => Step

    await expect(
      runSteps([verb({ 'x-a': '1' }), leafStep(() => ({ ok: true }))], {}, seed),
    ).rejects.toThrow(/no headers sink on ctx/)
  })

  it('shares a policy by sharing the VALUE, not a second composable form', async () => {
    // What the exported `setHeaders` guard used to be for. A plain object does
    // it, so there is one way to write this and not two.
    const cache = { 'cache-control': 'public, max-age=60' }

    const a = scope(http).extend(headers).headers(cache).handle(() => ({ ok: true }))
    const b = scope(http).extend(headers).headers(cache).handle(() => ({ ok: true }))

    expect(readHeaders(await a<{}, 'response-headers'>({}, seed)).get('cache-control')).toBe(
      readHeaders(await b<{}, 'response-headers'>({}, seed)).get('cache-control'),
    )
  })
})
// The sink is created PER INVOCATION. Its twin in `cookies.test.ts` has always
// pinned this; without it here, hoisting the `Headers` into module scope — one
// bag shared by every request, so one caller's `x-user-id` rides on everyone
// else's response — passes the whole suite.
describe('the headers sink is per invocation', () => {
  const s = scope(http)
    .extend(headers)
    .handle((_deps: {}, ctx) => {
      ctx.response.headers.set('x-seen', 'yes')
      return { ok: true }
    })

  it('starts empty on every invocation', async () => {
    const first = await s<{}, 'response-headers'>({}, seed)
    expect([...readHeaders(first)]).toEqual([['x-seen', 'yes']])

    const second = await s<{}, 'response-headers'>({}, seed)
    // Exactly one, not two: the second run must not inherit the first.
    expect([...readHeaders(second)]).toEqual([['x-seen', 'yes']])
  })

  it('keeps concurrent runs of the SAME scope apart', async () => {
    const tagged = (tag: string) =>
      scope(http)
        .extend(headers)
        .handle(async (_deps: {}, ctx) => {
          ctx.response.headers.set('x-who', tag)
          await new Promise((r) => setTimeout(r, tag === 'slow' ? 20 : 0))
          return { ok: true }
        })

    const [slow, fast] = await Promise.all([
      tagged('slow')<{}, 'response-headers'>({}, seed),
      tagged('fast')<{}, 'response-headers'>({}, seed),
    ])
    expect([...readHeaders(slow)]).toEqual([['x-who', 'slow']])
    expect([...readHeaders(fast)]).toEqual([['x-who', 'fast']])
  })
})
