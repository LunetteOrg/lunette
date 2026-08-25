import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { app } from '../src/server.ts'

// The mounted SURFACE, one request at a time: every route answers with the
// shape its scope promises — status, body, headers — driven over a real HTTP
// socket with `fetch`. What it proves is the MOUNT, so the stack under it is
// the real one (the real chain, in-memory PGlite).
//
// Not an integration test in the isolate-one-component sense: the thing under
// test here only exists between a host and a chain, so both have to be real.
// Those tests live where a component CAN be isolated — the adapter against a
// fixture chain in `packages/integration/test`, PGlite on its own in
// `examples/app/app/db`, the chain with only its transport faked in
// `examples/app/app/bootstrap/chain.test.ts`.
//
// Its sibling `e2e.test.ts` shares this setup and differs in what it asks: a
// JOURNEY across requests (a session cookie surviving from one to the next)
// rather than each request judged on its own.
const start = async () => {
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe('example-app on Express — the mounted surface', () => {
  it('drives feed / post / login through a real HTTP round-trip', async () => {
    const { url, close } = await start()

    const feed = await fetch(`${url}/feed`)
    expect(feed.status).toBe(200)
    expect(await feed.json()).toEqual({ feed: [] })

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

  it('drives the new reads / gated writes / logout through a real socket', async () => {
    const { url, close } = await start()

    // public read: unknown post → empty comment list
    const comments = await fetch(`${url}/posts/nope/comments`)
    expect(comments.status).toBe(200)
    expect(await comments.json()).toEqual({ comments: [] })

    // the session gate: anonymous reads/writes are 401
    expect((await fetch(`${url}/me`)).status).toBe(401)
    const post = await fetch(`${url}/posts`, {
      method: 'POST',
      body: JSON.stringify({ title: 'x', body: 'y' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(post.status).toBe(401)

    // logout clears the session cookie and redirects (manual, don't follow)
    const out = await fetch(`${url}/logout`, { method: 'POST', redirect: 'manual' })
    expect(out.status).toBe(302)
    expect(out.headers.get('set-cookie')).toMatch(/^session=;/)

    await close()
  })
})
