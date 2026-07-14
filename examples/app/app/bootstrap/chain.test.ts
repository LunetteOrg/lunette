import { test } from '@lntt/wire/testing'
import { describe, expect, it } from 'vitest'
import { parseEnv } from '../config/env.ts'
import { isError, OtpInvalid, OtpMaxAttemptsExceeded } from '../lib/errors.ts'
import type { Mail, Transport } from '../lib/mailer/index.ts'
import { chain } from './chain.ts'

const env = parseEnv({})
const codeOf = (mail: Mail | undefined): string =>
  /code is (\d+)/.exec(mail?.body ?? '')?.[1] ?? ''

describe('the chain delivers only the public surface', () => {
  it('build() exposes the feature areas + helpers and hides the infra', async () => {
    const { app, dispose } = await chain.build({ env })
    try {
      expect(Object.keys(app).sort()).toEqual([
        'access',
        // the nonce generator + the signed cookies the auth handlers use
        // (login sets pending, verify sets session, logout drops it).
        'generateId',
        'getSession',
        'pendingCookie',
        'profile',
        'sessionCookie',
        'threads',
        'validateEmail',
      ])
      // Private wiring is absent at RUNTIME, not just in the type.
      const opaque = app as Record<string, unknown>
      expect(opaque.db).toBeUndefined()
      expect(opaque.otpRepo).toBeUndefined()
      expect(opaque.getRendered).toBeUndefined() // render fragment mounted privately
    } finally {
      await dispose()
    }
  })
})

describe('end-to-end through the real chain (only the transport faked)', () => {
  // the transport is a KEYED resource: substituted here, its layer is
  // SKIPPED — the feature-flag conditional never even runs
  it('OTP window commits attempts on the domain path (return = commit)', async () => {
    const sent: Mail[] = []
    const fakeTransport: Transport = async (mail) => {
      sent.push(mail)
    }

    await test(chain).run({ env, transport: fakeTransport }, async (app) => {
      await app.access.requestCode('a@b.c', 'n1')
      const wrong = () => app.access.verifyCode('a@b.c', '000000', 'n1', { termsAccepted: true })
      expect(await wrong()).toBeInstanceOf(OtpInvalid)
      expect(await wrong()).toBeInstanceOf(OtpInvalid)
      expect(await wrong()).toBeInstanceOf(OtpInvalid)
      // Each wrong attempt committed its increment — so the right code is now
      // locked out. If the tx had rolled back, attempts would still be 0.
      expect(
        await app.access.verifyCode('a@b.c', codeOf(sent[0]), 'n1', { termsAccepted: true }),
      ).toBeInstanceOf(OtpMaxAttemptsExceeded)
    })
  })

  it('content flow: sign in, publish, see it rendered in the feed', async () => {
    const sent: Mail[] = []
    const fakeTransport: Transport = async (mail) => {
      sent.push(mail)
    }

    await test(chain).run({ env, transport: fakeTransport }, async (app) => {
      await app.access.requestCode('writer@b.c', 'n2')
      const signin = await app.access.verifyCode('writer@b.c', codeOf(sent[0]), 'n2', {
        displayName: 'Writer',
        termsAccepted: true,
      })
      expect(isError(signin)).toBe(false)
      const userId = (signin as { userId: string }).userId

      const post = await app.threads.publishPost({
        authorId: userId,
        title: 'Hello',
        body: 'World body',
        status: 'published',
      })
      expect(isError(post)).toBe(false)
      const postId = (post as { id: string }).id

      const feed = await app.threads.listFeed('feed')
      expect(feed.length).toBe(1)
      expect(feed[0]?.authorName).toBe('Writer')
      expect(feed[0]?.excerpt.startsWith('[feed/html]')).toBe(true) // rendered by the fake

      const reading = await app.threads.getPostForReading(postId, 'web', userId)
      expect(isError(reading)).toBe(false)
      expect((reading as { body: string }).body).toContain('[web/html]')
    })
  })
})

describe('teardown: dispose() closes the disposable (withDb)', () => {
  it('a query after dispose fails — the pool was actually closed', async () => {
    const { app, dispose } = await chain.build({ env })
    // the db works before teardown
    expect(await app.threads.listFeed('feed')).toEqual([])
    await dispose()
    // withDb's `finally { close() }` ran: the pool is gone, so a query now
    // surfaces an infrastructure failure (a THROW), proving teardown happened.
    await expect(app.threads.listFeed('feed')).rejects.toBeDefined()
  })
})

describe('feature flag: RENDER_CACHE=off selects the no-op cache', () => {
  // The flag flips a conditional-birth resource; the app stays fully functional
  // — reads just render fresh every time (no cache row is ever written or read).
  it('the content flow still works with the DB cache disabled', async () => {
    const offEnv = parseEnv({ RENDER_CACHE: 'off' })
    const sent: Mail[] = []
    const fakeTransport: Transport = async (mail) => {
      sent.push(mail)
    }

    await test(chain).run({ env: offEnv, transport: fakeTransport }, async (app) => {
      await app.access.requestCode('nocache@b.c', 'n3')
      const signin = await app.access.verifyCode('nocache@b.c', codeOf(sent[0]), 'n3', {
        displayName: 'NoCache',
        termsAccepted: true,
      })
      const userId = (signin as { userId: string }).userId

      const post = await app.threads.publishPost({
        authorId: userId,
        title: 'Fresh',
        body: 'Rendered every read',
        status: 'published',
      })
      expect(isError(post)).toBe(false)

      // Reads render through the no-op cache (always a miss → the fake renderer
      // runs), so the output is present just as with the DB cache on.
      const feed = await app.threads.listFeed('feed')
      expect(feed.length).toBe(1)
      expect(feed[0]?.excerpt.startsWith('[feed/html]')).toBe(true)
    })
  })
})
