import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { makeServer } from '../src/server.ts'

// The hand-wired host driven over a real socket. Nothing here differs from the
// adapter-backed examples — that is the point: the response an @lntt/scope
// Outcome renders to is a property of the scope, not of the pack that mounts it.
const start = async () => {
  const server = makeServer()
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe('example-app hand-wired on node:http — integration', () => {
  it('serves reads, the 404 abort and the 422 validation abort', async () => {
    const { url, close } = await start()

    const feed = await fetch(`${url}/feed`)
    expect(feed.status).toBe(200)
    expect(await feed.json()).toEqual({ feed: [] })

    // a route param the mini router extracts by hand, then `runScope` validates
    const missing = await fetch(`${url}/posts/does-not-exist`)
    expect(missing.status).toBe(404)

    const comments = await fetch(`${url}/posts/nope/comments`)
    expect(comments.status).toBe(200)
    expect(await comments.json()).toEqual({ comments: [] })

    // the `body` capability: a form the scope declares via `.form`, rejected 422
    const bad = new FormData()
    bad.set('email', 'not-an-email')
    const invalid = await fetch(`${url}/login`, { method: 'POST', body: bad })
    expect(invalid.status).toBe(422)

    const good = new FormData()
    good.set('email', 'user@example.com')
    const ok = await fetch(`${url}/login`, { method: 'POST', body: good })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true })

    // an unrouted path never reaches a scope
    expect((await fetch(`${url}/nowhere`)).status).toBe(404)

    await close()
  })

  it('renders the session gate, the redirect intent and the cookie sink', async () => {
    const { url, close } = await start()

    expect((await fetch(`${url}/me`)).status).toBe(401)
    const post = await fetch(`${url}/posts`, {
      method: 'POST',
      body: JSON.stringify({ title: 'x', body: 'y' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(post.status).toBe(401)

    // `cookies` capability + a redirect intent, both rendered by hand
    const out = await fetch(`${url}/logout`, { method: 'POST', redirect: 'manual' })
    expect(out.status).toBe(302)
    expect(out.headers.get('location')).toBe('/')
    expect(out.headers.get('set-cookie')).toMatch(/^session=;/)

    await close()
  })
})
