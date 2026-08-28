import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import type { ServerResponse } from 'node:http'
import type { Abort, Outcome } from '@lntt/scope'
import { httpError, redirect } from '@lntt/scope/http'
import type { CookieEffect, SetCookie } from '@lntt/scope/cookies'
import { renderOutcome, toWebRequest } from '../src/node.ts'

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
    const req = toWebRequest(nodeRequest({ url: '/posts/42?draft=1&tag=x' }), 'http://localhost')
    expect(new URL(req.url).pathname).toBe('/posts/42')
    expect(new URL(req.url).search).toBe('?draft=1&tag=x')
  })

  it('prefers originalUrl, so an Express sub-router keeps its mount prefix', () => {
    const req = toWebRequest(nodeRequest({ url: '/42', originalUrl: '/api/posts/42' }), 'http://localhost')
    expect(new URL(req.url).pathname).toBe('/api/posts/42')
  })
})

describe('toWebRequest — the origin is GIVEN, never guessed', () => {
  it('resolves against the origin the caller supplies', () => {
    const req = toWebRequest(nodeRequest({}), 'https://canonical.example')
    expect(new URL(req.url).origin).toBe('https://canonical.example')
  })

  it('falls back to localhost when none is supplied — a non-answer, not a guess', () => {
    expect(new URL(toWebRequest(nodeRequest({}), 'http://localhost').url).origin).toBe(
      'http://localhost',
    )
  })

  it('IGNORES the Host header, which is the client speaking', () => {
    // Deciding which `Host` to believe is the host framework's policy — on
    // Express `app.set('trust proxy')`, which the pack reads through
    // `req.protocol`/`req.host` (§40). This lift holds no second opinion.
    const req = toWebRequest(nodeRequest({ headers: { host: 'evil.example' } }), 'https://app.example.com')
    expect(new URL(req.url).origin).toBe('https://app.example.com')
  })

  it('IGNORES X-Forwarded-*, for the same reason', () => {
    const req = toWebRequest(
      nodeRequest({ headers: { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' } }),
      'http://app.example.com',
    )
    expect(new URL(req.url).origin).toBe('http://app.example.com')
  })

  // The request TARGET is client-controlled too, and `new URL(target, base)`
  // drops the base whenever the target carries an origin. Each of these is a
  // legal thing to put on the wire.
  it('re-anchors a target that carries its own origin', () => {
    for (const target of [
      'http://evil.example/where',
      '//evil.example/where',
      '/\\evil.example/where',
      'https://evil.example:8443/where',
    ]) {
      const req = toWebRequest(nodeRequest({ url: target }), 'https://app.example.com')
      expect(new URL(req.url).origin).toBe('https://app.example.com')
    }
  })

  it('keeps path and query while re-anchoring', () => {
    const req = toWebRequest(nodeRequest({ url: '/posts?page=2&q=a b' }), 'https://app.example.com')
    const url = new URL(req.url)
    expect(url.pathname).toBe('/posts')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('q')).toBe('a b')
  })
})

describe('toWebRequest — method, headers and body', () => {
  it('carries the method and every header, repeated ones included', () => {
    const req = toWebRequest(
      nodeRequest({ method: 'POST', headers: { cookie: ['a=1', 'b=2'], accept: 'application/json' } }),
      'http://localhost',
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
      'http://localhost',
    )
    expect(await req.json()).toEqual({ title: 'hello' })
  })

  it('gives GET and HEAD no body', () => {
    expect(toWebRequest(nodeRequest({ method: 'GET' }), 'http://localhost').body).toBeNull()
    expect(toWebRequest(nodeRequest({ method: 'HEAD' }), 'http://localhost').body).toBeNull()
  })
})

// A ServerResponse faked at the surface the render writes to. Express's
// `Response` and Fastify's `res.raw` both ARE a ServerResponse, so what holds
// here holds for every node host.
const nodeResponse = () => {
  const written: {
    status?: number | undefined
    headers?: Record<string, string | string[]> | undefined
    body?: string | undefined
  } = {}
  const res = {
    writeHead(status: number, headers?: Record<string, string | string[]>) {
      written.status = status
      written.headers = headers ?? {}
      return res
    },
    end(body?: string) {
      written.body = body
      return res
    },
  }
  return { res: res as unknown as ServerResponse, written }
}

// The outcome as the extensions leave it: effects keyed by extension, which is
// what a host reads through their readers.
type Effects = CookieEffect & { readonly headers: Headers }

const effectsOf = (cookies: readonly SetCookie[] = [], headers = new Headers()): Effects => ({
  cookies,
  headers,
})

const ok = <R,>(value: R, cookies: readonly SetCookie[] = [], headers = new Headers()): Outcome<R, Effects> => ({
  ok: true,
  value,
  intent: undefined,
  effects: effectsOf(cookies, headers),
})

const aborted = (
  abort: Abort<never>,
  cookies: readonly SetCookie[] = [],
  headers = new Headers(),
): Outcome<never, Effects> => ({ ok: false, abort, effects: effectsOf(cookies, headers) })

describe('renderOutcome', () => {
  it('writes a leaf value as 200 JSON', () => {
    const { res, written } = nodeResponse()
    renderOutcome(res, ok({ feed: [] }))
    expect(written.status).toBe(200)
    expect(written.headers?.['content-type']).toBe('application/json')
    expect(written.body).toBe('{"feed":[]}')
  })

  it('turns a redirect intent into its status and Location, with no body', () => {
    const { res, written } = nodeResponse()
    renderOutcome(res, aborted(redirect('/dashboard') as unknown as Abort<never>))
    expect(written.status).toBe(302)
    expect(written.headers?.['location']).toBe('/dashboard')
    expect(written.body).toBeUndefined()
  })

  it('renders a status intent, with and without a body', () => {
    const bare = nodeResponse()
    renderOutcome(bare.res, aborted(httpError(401) as unknown as Abort<never>))
    expect(bare.written.status).toBe(401)
    expect(bare.written.body).toBeUndefined()
    expect(bare.written.headers?.['content-type']).toBeUndefined()

    const explained = nodeResponse()
    renderOutcome(explained.res, aborted(httpError(422, { field: 'email' }) as unknown as Abort<never>))
    expect(explained.written.status).toBe(422)
    expect(explained.written.body).toBe('{"field":"email"}')
  })

  it('emits the cookie sink on the ok branch AND on an abort', () => {
    // `maxAge: 0` is the CLEARING form, and it is the one a logout writes, so
    // the serializer is pinned on it here rather than only on its siblings.
    const cleared = nodeResponse()
    renderOutcome(
      cleared.res,
      ok({ done: true }, [{ name: 'session', value: '', options: { path: '/', maxAge: 0 } }]),
    )
    expect(cleared.written.headers?.['set-cookie']).toEqual(['session=; Path=/; Max-Age=0'])

    const cookies = [{ name: 'session', value: 'abc', options: { path: '/', httpOnly: true } }]

    const good = nodeResponse()
    renderOutcome(good.res, ok({ done: true }, cookies))
    expect(good.written.headers?.['set-cookie']).toEqual(['session=abc; Path=/; HttpOnly'])

    // the case that makes the sink ride BOTH branches: logging out drops the
    // cookie and redirects in one outcome.
    const goodbye = nodeResponse()
    renderOutcome(goodbye.res, aborted(redirect('/') as unknown as Abort<never>, cookies))
    expect(goodbye.written.status).toBe(302)
    expect(goodbye.written.headers?.['set-cookie']).toEqual(['session=abc; Path=/; HttpOnly'])
  })
})

// The status line is committed by `writeHead`, so anything that can throw must
// happen before it — otherwise the failure destroys the socket instead of
// becoming a response.
describe('renderOutcome when the value will not serialise', () => {
  it('fails before the status line is committed, so the host can still send a 500', () => {
    const { res, written } = nodeResponse()
    expect(() => renderOutcome(res, ok({ n: 1n }))).toThrow(TypeError)
    expect(written.status).toBeUndefined()
  })
})

// A `set-cookie` can come from either extension, and both have to survive —
// the Fetch codec appends, so this one must too or the same scope answers
// differently depending on the host.
describe('renderOutcome — two sources of Set-Cookie', () => {
  it('keeps a cookie written through the headers extension alongside the sink', () => {
    const { res, written } = nodeResponse()
    renderOutcome(res, {
      ok: true,
      value: { done: true },
      effects: {
        headers: [['set-cookie', 'from_headers=1']],
        cookies: [{ name: 'from_sink', value: 'y', options: { path: '/' } }],
      },
    } as never)
    expect(written.headers?.['set-cookie']).toEqual(['from_headers=1', 'from_sink=y; Path=/'])
  })
})

// `Secure` and `SameSite` are the two attributes a session cookie needs and
// that the sink could not express at all — not a limitation an app could work
// around, since the sink is the only way a scope writes one.
describe('serializeCookie — Secure and SameSite', () => {
  it('emits both, with SameSite capitalised the way the header wants', () => {
    const { res, written } = nodeResponse()
    renderOutcome(
      res,
      ok({ done: true }, [
        {
          name: 'session',
          value: 'abc',
          options: { path: '/', httpOnly: true, secure: true, sameSite: 'lax' },
        },
      ]),
    )
    expect(written.headers?.['set-cookie']).toEqual([
      'session=abc; Path=/; SameSite=Lax; Secure; HttpOnly',
    ])
  })

  it('omits them when unset — no default is applied on the app behalf', () => {
    const { res, written } = nodeResponse()
    renderOutcome(res, ok({ done: true }, [{ name: 'a', value: 'b', options: { path: '/' } }]))
    expect(written.headers?.['set-cookie']).toEqual(['a=b; Path=/'])
  })

  it('accepts SameSite=None, which a cross-site embed needs', () => {
    const { res, written } = nodeResponse()
    renderOutcome(
      res,
      ok({ done: true }, [
        { name: 'a', value: 'b', options: { sameSite: 'none', secure: true } },
      ]),
    )
    expect(written.headers?.['set-cookie']).toEqual(['a=b; SameSite=None; Secure'])
  })
})
