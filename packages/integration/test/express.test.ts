import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { describe, expect, it } from 'vitest'
import { scope } from '@lntt/scope'
import { request } from '@lntt/scope/request'
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
    app.get('/courses/:courseId', pack.handler(courseHandler))
    app.post('/login', pack.handler(loginHandler))
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

// The carrier options reach the lift, so `ctx.request.url` carries a REAL
// origin instead of a placeholder — and a spoofed `Host` does not travel into
// it once `allowedHosts` is set.
describe('Express pack — the request origin', () => {
  const urlScope = scope()
    .extend(request)
    .handle((_deps: {}, ctx) => ({ url: ctx.request.url }))

  const serve = async (carrier?: Parameters<typeof expressPack>[2]) => {
    const pack = expressPack(chain, () => ({ env: { label: 'express' } satisfies Env }), carrier)
    const app = express()
    app.use(pack.mount())
    app.get('/where', pack.handler(urlScope))
    return { ...(await startServer(app)), dispose: pack.dispose }
  }

  it('reflects the Host the client reached when nothing constrains it', async () => {
    const { url, close, dispose } = await serve()
    const res = await fetch(`${url}/where`)
    expect(await res.json()).toEqual({ url: `${url}/where` })
    await close()
    await dispose()
  })

  it('discards a Host outside the allowlist', async () => {
    const { url, close, dispose } = await serve({
      allowedHosts: ['app.example.com'],
      origin: 'https://app.example.com',
    })
    const res = await fetch(`${url}/where`, { headers: { host: 'evil.example' } })
    expect(await res.json()).toEqual({ url: 'https://app.example.com/where' })
    await close()
    await dispose()
  })
})
