import { describe, expect, it } from 'vitest'
import { scope, mount } from './kernel-transparent.ts'
import {
  http, params, body, cookies, authenticated, timed, traced,
  withHeader, cors, setCookie, isHttpWord, notFound, type Res,
} from './carrier-http.ts'

// The carrier assembled the way an app would: every shape it ships, in one
// scope, running. The point is not the responses — it is that the DECORATING
// wraps compose over a refusal and over a success alike, without any of them
// knowing what the fold hands back.

const host = {} as { readonly __renders?: { readonly status: true; readonly redirect: true } }

describe('a carrier of realistic size, on a transparent core', () => {
  const log: string[] = []
  const spans: string[] = []

  const article = scope(http)
    .step(timed(log))
    .step(traced(spans))
    .step(cors('*'))
    .step(withHeader('x-served-by', 'lntt'))
    .step(setCookie('sid=abc'))
    .step(params(['id']))
    .step(body())
    .step(cookies())
    .step(authenticated())
    .step(async (_app: {}, ctx: { readonly user: string; readonly params: Readonly<Record<string, string>> }) =>
      ctx.params['id'] === 'missing' ? notFound({ error: 'no such article' }) : { id: ctx.params['id'], by: ctx.user },
    )

  const run = mount(host, article)

  it('decorates a plain domain value, which `decorating` normalised on the way out', async () => {
    const out = (await run({}, { url: '/a1', cookie: 'u1' })) as unknown as Res
    expect(isHttpWord(out)).toBe(true)
    expect(out.status).toBe(200)
    expect(out.body).toEqual({ id: 'a1', by: 'u1' })
    // every decorating wrap applied, and none of them knew what it was decorating
    expect(out.headers).toEqual({
      'set-cookie': 'sid=abc',
      'x-served-by': 'lntt',
      'access-control-allow-origin': '*',
    })
  })

  it('decorates a REFUSAL the same way — the wraps never branched on it', async () => {
    const out = (await run({}, { url: '/missing', cookie: 'u1' })) as unknown as Res
    expect(out.status).toBe(404)
    expect(out.body).toEqual({ error: 'no such article' })
    expect(out.headers['x-served-by']).toBe('lntt')
    expect(out.headers['access-control-allow-origin']).toBe('*')
  })

  it('decorates a GUARD refusal too, from a step that never reached the leaf', async () => {
    const out = (await run({}, { url: '/a1', cookie: '' })) as unknown as Res
    expect(out.status).toBe(401)
    expect(out.headers['access-control-allow-origin']).toBe('*')
  })

  it('the observing wraps saw every run, and cost nothing to write', () => {
    expect(log).toHaveLength(3)
    expect(spans).toEqual(['open', 'close', 'open', 'close', 'open', 'close'])
  })
})
