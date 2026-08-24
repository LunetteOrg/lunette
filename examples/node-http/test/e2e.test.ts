import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { outbox, parseEnv } from '@lntt/example-app'
import { makeServer } from '../src/server.ts'

// The same authenticated round-trip the adapter-backed hosts run, on a host
// wired entirely by hand: sign in (a real OTP via the dev outbox) → the signed
// session cookie rides Set-Cookie → an authenticated write → read it back. What
// it proves is the guest posture (decision 33): every channel the scopes use —
// the `body`/`form` parse, the cookie sink, the redirect intent, the route
// param — survives without a single import from @lntt/integration.

const codeFrom = (body: string): string => /code is (\d+)/.exec(body)?.[1] ?? ''
const cookie = (res: Response, name: string): string => {
  const all = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? '']
  return all.map((c) => c.split(';')[0] ?? '').find((c) => c.startsWith(`${name}=`)) ?? ''
}

const start = async () => {
  const server = makeServer(parseEnv({ DEV_MAIL_OUTBOX: '1' }))
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe('example-app hand-wired on node:http — authenticated end-to-end', () => {
  it('sign in → publish → read back, with no adapter in the path', async () => {
    const { url, close } = await start()

    const form = new FormData()
    form.set('email', 'e2e-node-http@example.com')
    const login = await fetch(`${url}/login`, { method: 'POST', body: form, redirect: 'manual' })
    expect(login.status).toBe(200)
    const pending = cookie(login, 'pending-auth')
    expect(pending).toMatch(/^pending-auth=/)

    const code = codeFrom(outbox.at(-1)?.body ?? '')
    expect(code).toMatch(/^\d+$/)

    const verify = await fetch(`${url}/verify`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/json', cookie: pending },
      body: JSON.stringify({ code, displayName: 'E2E', termsAccepted: true }),
    })
    expect(verify.status).toBe(302)
    const session = cookie(verify, 'session')
    expect(session).toMatch(/^session=/)

    const publish = await fetch(`${url}/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: session },
      body: JSON.stringify({ title: 'Hello node:http e2e', body: 'World body' }),
    })
    expect(publish.status).toBe(200)
    const created = (await publish.json()) as { post: { id: string; title: string } }
    expect(created.post.title).toBe('Hello node:http e2e')

    const comment = await fetch(`${url}/posts/${created.post.id}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: session },
      body: JSON.stringify({ body: 'a comment' }),
    })
    expect(comment.status).toBe(200)

    const feed = await fetch(`${url}/feed`, { headers: { cookie: session } })
    const body = (await feed.json()) as { feed: { id: string }[] }
    expect(body.feed.some((p) => p.id === created.post.id)).toBe(true)

    await close()
  })
})
