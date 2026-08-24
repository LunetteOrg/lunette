import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { toWebRequest } from '../src/node.ts'

// A node request, faked at exactly the surface the lift reads. `body` becomes
// the stream the Web Request drains, so the body assertions exercise the real
// undici path rather than a stub.
const nodeRequest = (init: {
  method?: string
  url?: string
  originalUrl?: string
  headers?: Record<string, string | string[]>
  encrypted?: boolean
  body?: string
}): IncomingMessage => {
  const stream = Readable.from(init.body === undefined ? [] : [init.body])
  return Object.assign(stream, {
    method: init.method ?? 'GET',
    url: init.url ?? '/',
    ...(init.originalUrl === undefined ? {} : { originalUrl: init.originalUrl }),
    headers: init.headers ?? {},
    socket: { encrypted: init.encrypted ?? false },
  }) as unknown as IncomingMessage
}

describe('toWebRequest — the path', () => {
  it('keeps path and query', () => {
    const req = toWebRequest(nodeRequest({ url: '/posts/42?draft=1&tag=x' }))
    expect(new URL(req.url).pathname).toBe('/posts/42')
    expect(new URL(req.url).search).toBe('?draft=1&tag=x')
  })

  it('prefers originalUrl, so an Express sub-router keeps its mount prefix', () => {
    const req = toWebRequest(nodeRequest({ url: '/42', originalUrl: '/api/posts/42' }))
    expect(new URL(req.url).pathname).toBe('/api/posts/42')
  })
})

describe('toWebRequest — the origin', () => {
  it('uses the Host header when no allowlist constrains it', () => {
    const req = toWebRequest(nodeRequest({ headers: { host: 'app.example.com' } }))
    expect(new URL(req.url).origin).toBe('http://app.example.com')
  })

  it('falls back to the default origin when there is no Host at all', () => {
    expect(new URL(toWebRequest(nodeRequest({})).url).origin).toBe('http://localhost')
  })

  it('honours a caller-supplied fallback origin', () => {
    const req = toWebRequest(nodeRequest({}), { origin: 'https://canonical.example' })
    expect(new URL(req.url).origin).toBe('https://canonical.example')
  })

  it('accepts a Host that is on the allowlist', () => {
    const req = toWebRequest(nodeRequest({ headers: { host: 'app.example.com' } }), {
      allowedHosts: ['app.example.com'],
    })
    expect(new URL(req.url).origin).toBe('http://app.example.com')
  })

  it('rejects a spoofed Host and falls back — no header injection', () => {
    const req = toWebRequest(nodeRequest({ headers: { host: 'evil.example' } }), {
      allowedHosts: ['app.example.com'],
      origin: 'https://app.example.com',
    })
    expect(new URL(req.url).origin).toBe('https://app.example.com')
  })

  it('marks the request https when the socket is encrypted', () => {
    const req = toWebRequest(nodeRequest({ headers: { host: 'app.example.com' }, encrypted: true }))
    expect(new URL(req.url).origin).toBe('https://app.example.com')
  })
})

describe('toWebRequest — forwarded headers', () => {
  const forwarded = {
    host: 'internal:8080',
    'x-forwarded-host': 'app.example.com',
    'x-forwarded-proto': 'https',
  }

  it('ignores X-Forwarded-* unless the caller trusts the proxy', () => {
    expect(new URL(toWebRequest(nodeRequest({ headers: forwarded })).url).origin).toBe(
      'http://internal:8080',
    )
  })

  it('reads them when trustProxy is set', () => {
    const req = toWebRequest(nodeRequest({ headers: forwarded }), { trustProxy: true })
    expect(new URL(req.url).origin).toBe('https://app.example.com')
  })

  it('takes the first hop of a comma-separated X-Forwarded-Host', () => {
    const req = toWebRequest(
      nodeRequest({ headers: { 'x-forwarded-host': 'app.example.com, inner.local' } }),
      { trustProxy: true },
    )
    expect(new URL(req.url).origin).toBe('http://app.example.com')
  })

  it('still applies the allowlist to a forwarded host', () => {
    const req = toWebRequest(
      nodeRequest({ headers: { 'x-forwarded-host': 'evil.example' } }),
      { trustProxy: true, allowedHosts: ['app.example.com'], origin: 'https://app.example.com' },
    )
    expect(new URL(req.url).origin).toBe('https://app.example.com')
  })
})

describe('toWebRequest — method, headers and body', () => {
  it('carries the method and every header, repeated ones included', () => {
    const req = toWebRequest(
      nodeRequest({ method: 'POST', headers: { cookie: ['a=1', 'b=2'], accept: 'application/json' } }),
    )
    expect(req.method).toBe('POST')
    expect(req.headers.get('accept')).toBe('application/json')
    // `Headers` joins repeated cookies with '; ' per the Fetch spec, so the
    // pair reaches the scope as one readable cookie header.
    expect(req.headers.get('cookie')).toBe('a=1; b=2')
  })

  it('streams the node request as the body, so the scope can read it', async () => {
    const req = toWebRequest(
      nodeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'hello' }),
      }),
    )
    expect(await req.json()).toEqual({ title: 'hello' })
  })

  it('gives GET and HEAD no body', () => {
    expect(toWebRequest(nodeRequest({ method: 'GET' })).body).toBeNull()
    expect(toWebRequest(nodeRequest({ method: 'HEAD' })).body).toBeNull()
  })
})
