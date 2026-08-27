import { start } from './serve.ts'
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

// A FULL authenticated round-trip over a REAL HTTP socket: sign in (real OTP via
// the dev outbox) → the signed session cookie rides Set-Cookie → authenticated
// write → read back. The app runs with DEV_MAIL_OUTBOX so the code is
// readable; `redirect: 'manual'` keeps the verify 302 so its cookie is visible.

const codeFrom = (body: string): string => /code is (\d+)/.exec(body)?.[1] ?? ''
const cookie = (res: Response, name: string): string => {
  const all = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? '']
  return all.map((c) => c.split(';')[0] ?? '').find((c) => c.startsWith(`${name}=`)) ?? ''
}


describe('example-app on Express — authenticated end-to-end', () => {
  it('sign in → publish → read back over a real HTTP socket', async () => {
    const { url, close } = await start(app)

    const form = new FormData()
    form.set('email', 'e2e-express@example.com')
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
      body: JSON.stringify({ title: 'Hello express e2e', body: 'World body' }),
    })
    expect(publish.status).toBe(200)
    const created = (await publish.json()) as { post: { id: string; title: string } }
    expect(created.post.title).toBe('Hello express e2e')

    const feed = await fetch(`${url}/feed`, { headers: { cookie: session } })
    const body = (await feed.json()) as { feed: { id: string }[] }
    expect(body.feed.some((p) => p.id === created.post.id)).toBe(true)

    await close()
  })
})
