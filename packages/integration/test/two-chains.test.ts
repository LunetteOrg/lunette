import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { lunette } from '@lntt/wire'
import { scope } from '@lntt/scope'
import { express as expressPack } from '../src/express.ts'
import { hono as honoPack } from '../src/hono.ts'

// Two DIFFERENT chains serving routes in ONE host app — the arrangement the
// guest posture claims (§33: wire never wraps the router, so several chains can
// coexist). It held only as long as nobody registered a second `mount`: the app
// used to travel to the handler through a context slot both packs wrote, so the
// last mount won and a route answered from the WRONG chain — silently, since
// `DepGuard` is satisfied by any chain whose surface fits. Handlers now read the
// app from their own pack's build-once handle, which is what makes this pass.
const chainA = lunette<{ env: {} }>().expose(() => ({ who: () => 'A' }))
const chainB = lunette<{ env: {} }>().expose(() => ({ who: () => 'B' }))
const whoScope = scope().handle((deps: { who: () => string }) => ({ who: deps.who() }))

describe('two packs, one app', () => {
  it('serves each Express route from ITS OWN chain', async () => {
    const a = expressPack(chainA, () => ({ env: {} }))
    const b = expressPack(chainB, () => ({ env: {} }))
    const app = express()
    // both mounts registered: the accessory context slot is written twice, and
    // the handlers must not care.
    app.use(a.mount())
    app.use(b.mount())
    app.get('/a', a.handler(whoScope))
    app.get('/b', b.handler(whoScope))

    const server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const { port } = server.address() as AddressInfo
    const url = `http://localhost:${port}`

    expect(await (await fetch(`${url}/a`)).json()).toEqual({ who: 'A' })
    expect(await (await fetch(`${url}/b`)).json()).toEqual({ who: 'B' })

    await new Promise<void>((resolve) => server.close(() => resolve()))
    await a.dispose()
    await b.dispose()
  })

  it('serves each Hono route from ITS OWN chain', async () => {
    const a = honoPack(chainA, () => ({ env: {} }))
    const b = honoPack(chainB, () => ({ env: {} }))
    const app = new Hono()
      .use(a.mount())
      .use(b.mount())
      .get('/a', ...a.handler(whoScope))
      .get('/b', ...b.handler(whoScope))

    expect(await (await app.request('/a')).json()).toEqual({ who: 'A' })
    expect(await (await app.request('/b')).json()).toEqual({ who: 'B' })

    await a.dispose()
    await b.dispose()
  })

  it('keeps the accessory context slot usable by giving each pack its own key', async () => {
    // `mount` is optional and exists for code OUTSIDE a scope. Two packs sharing
    // one app must not share the slot, so each takes its own contextKey.
    const a = expressPack(chainA, () => ({ env: {} }), { contextKey: 'appA' })
    const b = expressPack(chainB, () => ({ env: {} }), { contextKey: 'appB' })
    const app = express()
    app.use(a.mount())
    app.use(b.mount())
    // a hand-written route, no scope in sight, reading both apps off the request
    app.get('/both', (req, res) => {
      const reads = req as unknown as Record<string, { who: () => string }>
      res.json({ a: reads['appA']?.who(), b: reads['appB']?.who() })
    })

    const server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const { port } = server.address() as AddressInfo

    expect(await (await fetch(`http://localhost:${port}/both`)).json()).toEqual({ a: 'A', b: 'B' })

    await new Promise<void>((resolve) => server.close(() => resolve()))
    await a.dispose()
    await b.dispose()
  })
})
