import { describe, expect, it } from 'vitest'
import { outbox } from '@lntt/example-app'
import { app } from '../src/server.ts'

// The env this suite needs. ESM hoists the imports above this line, so the
// composition root has already been evaluated by the time it runs — and that is
// fine BECAUSE the build is lazy: the seed is a thunk `ensure` evaluates on the
// build that actually happens (§36), which is the first request below. Setting
// the env is therefore all it takes to run the app differently, and an eager
// build would fail this test. Vitest isolates modules per file, so the
// neighbouring suites get their own app from their own env.
process.env['DEV_MAIL_OUTBOX'] = '1'

// A FULL authenticated round-trip THROUGH Hono's HTTP layer: sign in (a real OTP,
// recovered from the in-memory dev outbox) → the signed session cookie rides
// Set-Cookie → an authenticated write → read it back. This proves the cookie
// sign/read round-trip AND gated write routing end to end — not just at the unit
// or codec level. The app runs with DEV_MAIL_OUTBOX so the code is readable.

const codeFrom = (body: string): string => /code is (\d+)/.exec(body)?.[1] ?? ''

const cookie = (res: Response, name: string): string => {
  const all = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? '']
  return all.map((c) => c.split(';')[0] ?? '').find((c) => c.startsWith(`${name}=`)) ?? ''
}

describe('example-app on Hono — authenticated end-to-end', () => {
  it('sign in → publish → read back, through the real HTTP cookie flow', async () => {
    // 1. login: email → 200 + a signed pending cookie
    const form = new FormData()
    form.set('email', 'e2e@example.com')
    const login = await app.request('/login', { method: 'POST', body: form })
    expect(login.status).toBe(200)
    const pending = cookie(login, 'pending-auth')
    expect(pending).toMatch(/^pending-auth=/)

    // 2. the sign-in code landed in the outbox
    const code = codeFrom(outbox.at(-1)?.body ?? '')
    expect(code).toMatch(/^\d+$/)

    // 3. verify: code + new-user registration → 302 + a signed session cookie
    const verify = await app.request('/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: pending },
      body: JSON.stringify({ code, displayName: 'E2E', termsAccepted: true }),
    })
    expect(verify.status).toBe(302)
    const session = cookie(verify, 'session')
    expect(session).toMatch(/^session=/)

    // 4. authenticated publish → the created post
    const publish = await app.request('/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: session },
      body: JSON.stringify({ title: 'Hello e2e', body: 'World body' }),
    })
    expect(publish.status).toBe(200)
    const created = (await publish.json()) as { post: { id: string; title: string } }
    expect(created.post.title).toBe('Hello e2e')

    // 5. read the feed as the signed-in author → the post is there
    const feed = await app.request('/feed', { headers: { cookie: session } })
    const body = (await feed.json()) as { feed: { id: string }[] }
    expect(body.feed.some((p) => p.id === created.post.id)).toBe(true)
  })
})
