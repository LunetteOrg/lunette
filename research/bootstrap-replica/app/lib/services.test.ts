import { describe, expect, it } from 'vitest'
import { parseEnv } from '../config/env.ts'
import { blobs } from './blobs/index.ts'
import { pendingCookie, sessionCookie } from './cookies.ts'
import { mailer } from './mailer/index.ts'
import { renderer } from './renderer/index.ts'

const env = parseEnv({})

describe('feature-flagged services default to the fakes', () => {
  it('renderer fake is deterministic and detects format', async () => {
    const r = renderer({ env })
    expect(await r.render({ text: 'hello', surface: 'feed', format: 'text' })).toBe('[feed/text] hello')
    expect(await r.detect('# title')).toBe('markdown')
    expect(await r.detect('plain')).toBe('text')
  })

  it('blobs fake round-trips through memory and serves memory:// urls', async () => {
    const b = blobs({ env })
    await b.put('k1', new Uint8Array([1, 2, 3]), 'application/octet-stream')
    expect(b.url('k1')).toBe('memory://k1')
    await b.remove('k1')
  })

  it('mailer fake send resolves', async () => {
    await expect(mailer({ env }).send({ to: 'a@b.c', subject: 's', body: 'b' })).resolves.toBeUndefined()
  })
})

describe('signed cookies round-trip and reject tampering', () => {
  const requestWith = (header: string) =>
    new Request('http://x', { headers: { cookie: header } })

  it('writes and reads back a session id', async () => {
    const c = sessionCookie({ env })
    const setCookie = c.write('sess-123')
    const value = setCookie.split(';')[0] // name=payload.sig
    expect(await c.read(requestWith(value!))).toBe('sess-123')
  })

  it('rejects a tampered signature', async () => {
    const c = pendingCookie({ env })
    const setCookie = c.write({ email: 'a@b.c', nonce: 'n' })
    const tampered = `${setCookie.split(';')[0]}x`
    expect(await c.read(requestWith(tampered))).toBeNull()
  })
})
