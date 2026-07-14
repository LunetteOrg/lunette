import { describe, expect, it } from 'vitest'
import { outbox, parseEnv } from '@lntt/example-app'
import { makePack } from '../src/routes.ts'

// A FULL authenticated round-trip through React Router loaders/actions: sign in
// (real OTP via the dev outbox) → the signed session cookie rides the action's
// Response → authenticated action → read back via a loader. `makePack` builds a
// pack seeded with DEV_MAIL_OUTBOX so the code is readable.

const codeFrom = (body: string): string => /code is (\d+)/.exec(body)?.[1] ?? ''
const cookie = (res: Response, name: string): string => {
  const all = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? '']
  return all.map((c) => c.split(';')[0] ?? '').find((c) => c.startsWith(`${name}=`)) ?? ''
}

describe('example-app on React Router 7 — authenticated end-to-end', () => {
  it('sign in → publish → read back through loaders/actions', async () => {
    const { pack, loginAction, verifyAction, publishPostAction, feedLoader } = makePack(
      parseEnv({ DEV_MAIL_OUTBOX: '1' }),
    )
    const context = await pack.mount({})

    const form = new FormData()
    form.set('email', 'e2e-rr7@example.com')
    const login = await loginAction({
      request: new Request('http://x/login', { method: 'POST', body: form }),
      params: {},
      context,
    })
    expect(login.status).toBe(200)
    const pending = cookie(login, 'pending-auth')
    expect(pending).toMatch(/^pending-auth=/)

    const code = codeFrom(outbox.at(-1)?.body ?? '')
    expect(code).toMatch(/^\d+$/)

    const verify = await verifyAction({
      request: new Request('http://x/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: pending },
        body: JSON.stringify({ code, displayName: 'E2E', termsAccepted: true }),
      }),
      params: {},
      context,
    })
    expect(verify.status).toBe(302)
    const session = cookie(verify, 'session')
    expect(session).toMatch(/^session=/)

    const publish = await publishPostAction({
      request: new Request('http://x/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: session },
        body: JSON.stringify({ title: 'Hello rr7 e2e', body: 'World body' }),
      }),
      params: {},
      context,
    })
    expect(publish.status).toBe(200)
    const created = (await publish.json()) as { post: { id: string; title: string } }
    expect(created.post.title).toBe('Hello rr7 e2e')

    const feed = await feedLoader({
      request: new Request('http://x/feed', { headers: { cookie: session } }),
      params: {},
      context,
    })
    const body = (await feed.json()) as { feed: { id: string }[] }
    expect(body.feed.some((p) => p.id === created.post.id)).toBe(true)
  })
})
