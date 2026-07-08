import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { makeApp } from '../src/server.ts'

// Integration test: the real example app mounted on a real Express server,
// driven over an actual HTTP socket with `fetch`. Complements the app's unit
// tests (fragments with fake deps).
const start = async () => {
  const server = createServer(makeApp())
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe('example-app on Express — integration', () => {
  it('drives feed / post / login through a real HTTP round-trip', async () => {
    const { url, close } = await start()

    const feed = await fetch(`${url}/feed`)
    expect(feed.status).toBe(200)
    expect(await feed.json()).toEqual({ signedIn: false, feed: [] })

    const missing = await fetch(`${url}/posts/does-not-exist`)
    expect(missing.status).toBe(404)

    const bad = new FormData()
    bad.set('email', 'not-an-email')
    const invalid = await fetch(`${url}/login`, { method: 'POST', body: bad })
    expect(invalid.status).toBe(422)

    const good = new FormData()
    good.set('email', 'user@example.com')
    const ok = await fetch(`${url}/login`, { method: 'POST', body: good })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true })

    await close()
  })
})
