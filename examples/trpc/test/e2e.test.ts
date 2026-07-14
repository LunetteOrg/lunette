import { describe, expect, it } from 'vitest'
import { outbox, parseEnv } from '@lntt/example-app'
import { chain, createCaller } from '../src/router.ts'

// A FULL authenticated round-trip through the tRPC caller. tRPC has NO login/
// verify procedures (those are cookie/redirect flows — HTTP-only), so the sign-in
// happens OUT OF BAND via the app's own methods (real OTP through the dev
// outbox). The resulting session is minted into a signed cookie that rides the
// request; the write guards read it off the headers exactly as on HTTP. Then the
// authenticated `publishPost` MUTATION runs, and the feed query shows the post.
//
// CAVEAT: authenticating tRPC with a session COOKIE is realistic only for a
// BROWSER client (fetch sends the cookie automatically). Server-to-server /
// mobile / public-API tRPC clients authenticate with a BEARER TOKEN / API key,
// which this test does not exercise. Reflecting that path (a `readBearer` guard)
// is follow-up #37. What this proves is that the SHARED cookie session works
// uniformly across every host, tRPC included — not that the bearer path works.

const codeFrom = (body: string): string => /code is (\d+)/.exec(body)?.[1] ?? ''

describe('example-app on tRPC — authenticated end-to-end', () => {
  it('sign in (out of band) → publish mutation → read back via the feed query', async () => {
    const { app, dispose } = await chain.build({ env: parseEnv({ DEV_MAIL_OUTBOX: '1' }) })
    try {
      // sign in out of band — tRPC exposes no login/verify
      await app.access.requestCode('e2e-trpc@example.com', 'n1')
      const code = codeFrom(outbox.at(-1)?.body ?? '')
      expect(code).toMatch(/^\d+$/)
      const signin = await app.access.verifyCode('e2e-trpc@example.com', code, 'n1', {
        displayName: 'E2E',
        termsAccepted: true,
      })
      const sessionId = (signin as { sessionId: string }).sessionId
      expect(sessionId).toBeTruthy()

      // mint the signed session cookie the request carries; the write's auth
      // guards read it off the headers via RequestHead, same as on HTTP.
      const sessionCookie = app.sessionCookie.write(sessionId).split(';')[0] ?? ''
      const request = new Request('http://x/', { headers: { cookie: sessionCookie } })
      const caller = createCaller({ ...app, request })

      const created = await caller.publishPost({ title: 'Hello trpc e2e', body: 'World body' })
      expect(created.post.title).toBe('Hello trpc e2e')

      const anon = createCaller({ ...app, request: new Request('http://x/') })
      const feed = await anon.feed({})
      expect(feed.feed.some((p) => p.id === created.post.id)).toBe(true)
    } finally {
      await dispose()
    }
  })
})
