import { data, isRouteErrorResponse, redirect } from 'react-router'
import { describe, expect, it } from 'vitest'
import { scope } from '@lntt/scope'
import { cookies } from '@lntt/scope/cookies'
import { chain, type Env } from './fixture/chain.ts'
import { courseHandler, loginHandler } from './fixture/handlers.ts'
import { reactRouter } from '../src/react-router.ts'

const bearer = (u: string) =>
  new Request('http://x/', { headers: { authorization: `Bearer ${u}` } })

// The pack takes the CHAIN and owns build-once; `seedFrom` maps whatever RR7
// hands the loader as `context` to the chain's Seed. Loaders are invoked the way
// React Router invokes them — no load context, because under
// `react-router-serve` there is nowhere to register one.
const pack = reactRouter(chain, (env) => ({ env: (env ?? { label: 'rr7' }) as Env }))

// What a status abort looks like once thrown: a loader signals "no page here" by
// throwing, and RR7 routes it to the nearest ErrorBoundary.
const thrownBy = async (run: () => Promise<unknown>) => {
  try {
    await run()
  } catch (thrown) {
    return thrown
  }
  throw new Error('expected the loader to throw')
}

describe('React Router 7 pack — loaders speak RR7, not HTTP', () => {
  it('hands the leaf value straight to loaderData', async () => {
    const value = await pack.toLoader(courseHandler)({
      request: bearer('u-admin'),
      params: { courseId: 'c1' },
    })
    // NOT a Response: the loader's return type is the leaf's R, which is what
    // keeps `loaderData` typed in a route module.
    expect(value).toEqual({ id: 'c1', title: 'Owned by admin' })
  })

  it('throws a status abort for the ErrorBoundary — the leaf never runs', async () => {
    const thrown = await thrownBy(() =>
      pack.toLoader(courseHandler)({ request: bearer('u-admin'), params: { courseId: 'c2' } }),
    )
    expect((thrown as { init: { status: number } }).init.status).toBe(403)
  })

  it('throws 401 for an anonymous request', async () => {
    const thrown = await thrownBy(() =>
      pack.toLoader(courseHandler)({ request: new Request('http://x/'), params: { courseId: 'c1' } }),
    )
    expect((thrown as { init: { status: number } }).init.status).toBe(401)
  })

  it('returns a redirect intent as an RR7 redirect, cookies attached', async () => {
    const out = (await pack.toAction(loginHandler)({
      request: new Request('http://x/login', { method: 'POST' }),
      params: {},
    })) as Response
    expect(out).toBeInstanceOf(Response)
    expect(out.status).toBe(302)
    expect(out.headers.get('location')).toBe('/dashboard')
    expect(out.headers.get('set-cookie')).toContain('sid=u-admin')
  })

  it('builds once across loaders, and disposes', async () => {
    const first = await pack.toLoader(courseHandler)({
      request: bearer('u-admin'),
      params: { courseId: 'c1' },
    })
    const second = await pack.toLoader(courseHandler)({
      request: bearer('u-admin'),
      params: { courseId: 'c1' },
    })
    expect(second).toEqual(first)
    await pack.dispose()
  })
})

// `isRouteErrorResponse` is React Router's own predicate for what an
// ErrorBoundary receives; keeping the import proves the thrown value is meant
// for that channel even though `data()` is unwrapped by the router first.
describe('the thrown abort', () => {
  it('is a data() carrier, which RR7 turns into a route error response', async () => {
    const thrown = await thrownBy(() =>
      pack.toLoader(courseHandler)({ request: new Request('http://x/'), params: { courseId: 'c1' } }),
    )
    expect(isRouteErrorResponse(thrown)).toBe(false) // not yet — the router wraps it
    expect(thrown).toHaveProperty('type', 'DataWithResponseInit')
  })
})

// A leaf MAY speak React Router directly. That makes the scope unportable — it
// imports the framework — so it is a per-app choice, not something a shared
// scope catalogue should do. What the pack guarantees is that the choice is
// HONOURED rather than half-applied: whatever the leaf built is not re-wrapped,
// and the sinks' effects are merged into it.
describe('a leaf that speaks React Router itself', () => {
  it('keeps a `data()` the leaf built, status and all', async () => {
    const s = scope().handle(() => data({ via: 'data' }, { status: 202 }))
    const out = (await pack.toLoader(s)({ request: new Request('http://x/'), params: {} })) as {
      data: unknown
      init: ResponseInit
    }
    expect(out.data).toEqual({ via: 'data' })
    expect(out.init.status).toBe(202)
  })

  it('merges the cookie sink INTO it instead of wrapping it again', async () => {
    // The regression this exists for: wrapping a `data()` in another `data()`
    // dropped the status and serialized RR7's internal carrier as the body.
    const s = scope()
      .extend(cookies)
      .handle((_deps: {}, ctx) => {
        ctx.cookies.set('probe', '1')
        return data({ via: 'data+cookie' }, { status: 202 })
      })

    const out = (await pack.toLoader(s)({ request: new Request('http://x/'), params: {} })) as {
      data: unknown
      init: { status?: number; headers?: Headers }
    }
    expect(out.data).toEqual({ via: 'data+cookie' })
    expect(out.init.status).toBe(202)
    expect(out.init.headers?.get('set-cookie')).toBe('probe=1')
  })

  it('keeps a Response the leaf built, and adds the effects to it', async () => {
    const s = scope()
      .extend(cookies)
      .handle((_deps: {}, ctx) => {
        ctx.cookies.set('probe', '2')
        return new Response('plain text', { status: 201, headers: { 'content-type': 'text/plain' } })
      })

    const out = (await pack.toLoader(s)({ request: new Request('http://x/'), params: {} })) as Response
    expect(out).toBeInstanceOf(Response)
    expect(out.status).toBe(201)
    expect(out.headers.get('content-type')).toBe('text/plain')
    expect(out.headers.get('set-cookie')).toBe('probe=2')
    expect(await out.text()).toBe('plain text')
  })

  it('lets a thrown redirect travel straight past the fold', async () => {
    // Nothing to merge here: a throw does not pass through the outcome at all,
    // which is exactly React Router's own idiom.
    const s = scope().handle(() => {
      throw redirect('/elsewhere')
    })
    const thrown = await thrownBy(() =>
      pack.toLoader(s)({ request: new Request('http://x/'), params: {} }),
    )
    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(302)
    expect((thrown as Response).headers.get('location')).toBe('/elsewhere')
  })
})
