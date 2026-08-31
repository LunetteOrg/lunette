import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { describe, expect, it } from 'vitest'
import { scope } from '@lntt/scope'
import { headers } from '@lntt/scope/headers'
import { request } from '@lntt/scope/request'
import { http, httpError } from '@lntt/scope/http'
import { chain, type Env } from './fixture/chain.ts'
import { courseHandler, loginHandler } from './fixture/handlers.ts'
import { express as expressPack } from '../src/express.ts'

const startServer = async (handler: express.Express) => {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe('Express pack — mount middleware + real HTTP round-trip', () => {
  it('runs the same handlers behind a real express server', async () => {
    const pack = expressPack(chain, () => ({ env: { label: 'express' } satisfies Env }))

    const app = express()
    // mount is registered ONCE; it ensures the build and attaches the app.
    app.use(pack.mount())
    app.get(...pack.handler('/courses/:courseId', courseHandler))
    app.post(...pack.handler('/login', loginHandler))
    const { url, close } = await startServer(app)

    const auth = { headers: { authorization: 'Bearer u-admin' } }

    const ok = await fetch(`${url}/courses/c1`, auth)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ id: 'c1', title: 'Owned by admin' })

    const forbidden = await fetch(`${url}/courses/c2`, auth)
    expect(forbidden.status).toBe(403)

    const anon = await fetch(`${url}/courses/c1`)
    expect(anon.status).toBe(401)

    const login = await fetch(`${url}/login`, { method: 'POST', redirect: 'manual' })
    expect(login.status).toBe(302)
    expect(login.headers.get('location')).toBe('/dashboard')
    expect(login.headers.get('set-cookie')).toContain('sid=u-admin')
    expect(login.headers.get('set-cookie')).toContain('HttpOnly')

    await close()
    await pack.dispose()
  })
})

// The origin comes from EXPRESS — `req.protocol`/`req.host`, i.e. whatever
// `app.set('trust proxy')` says — so `ctx.request.url` carries a real origin
// without this pack holding a proxy policy of its own (§40).
describe('Express pack — the request origin', () => {
  const urlScope = scope()
    .extend(request)
    .handle((_deps: {}, ctx) => ({ url: ctx.request.url }))

  const serve = async (options?: Parameters<typeof expressPack>[2]) => {
    const pack = expressPack(chain, () => ({ env: { label: 'express' } satisfies Env }), options)
    const app = express()
    app.use(pack.mount())
    app.get(...pack.handler('/where', urlScope))
    return { ...(await startServer(app)), dispose: pack.dispose }
  }

  it('reflects what Express reports, port included', async () => {
    const { url, close, dispose } = await serve()
    const res = await fetch(`${url}/where`)
    expect(await res.json()).toEqual({ url: `${url}/where` })
    await close()
    await dispose()
  })

  it('does not let a request target smuggle in another origin', async () => {
    // `//evil.example/where` is a legal target and reaches Express as one; the
    // route still matches, so without re-anchoring the scope would read an
    // attacker's origin from an otherwise ordinary authenticated request.
    const { url, close, dispose } = await serve()
    const res = await fetch(`${url}//evil.example/where`, { redirect: 'manual' })
    if (res.status === 200) {
      const seen = (await res.json()) as { url: string }
      expect(new URL(seen.url).origin).toBe(url)
    }
    await close()
    await dispose()
  })
})

// The header sink, end to end over a real socket: what a scope declares at the
// wiring has to arrive on the wire, on the success branch AND on an abort.
describe('Express pack — response headers', () => {
  const cached = scope()
    .extend(headers)
    .headers({ 'cache-control': 'public, max-age=60' })
    .handle(() => ({ ok: true }))

  const rateLimited = scope()
    .extend(http)
    .extend(headers)
    .guard((_deps: {}, ctx) => {
      ctx.headers.set('retry-after', '30')
      return httpError(429, { error: 'slow down' })
    })
    .handle(() => ({ never: true }))

  it('renders declared headers alongside the value', async () => {
    const pack = expressPack(chain, () => ({ env: { label: 'express' } satisfies Env }))
    const app = express()
    app.get(...pack.handler('/cached', cached))
    const { url, close } = await startServer(app)

    const res = await fetch(`${url}/cached`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=60')

    await close()
    await pack.dispose()
  })

  it('keeps the headers a guard wrote before it aborted', async () => {
    const pack = expressPack(chain, () => ({ env: { label: 'express' } satisfies Env }))
    const app = express()
    app.get(...pack.handler('/limited', rateLimited))
    const { url, close } = await startServer(app)

    const res = await fetch(`${url}/limited`)
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('30')
    expect(await res.json()).toEqual({ error: 'slow down' })

    await close()
    await pack.dispose()
  })
})
