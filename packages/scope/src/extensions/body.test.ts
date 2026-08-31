import { describe, expect, it } from 'vitest'
import { standardSchema } from './standard-schema.ts'
import { z } from 'zod'
import { scope } from '../scope.ts'
import type { ScopeExtensionValue, Step } from '../scope.ts'
import { body } from './body.ts'
import { http } from './http.ts'

// Unit test — the `body` channel in ISOLATION. Under the step primitive a
// channel does ONE thing: populate its entry. Validating it is `validate`'s own
// step, so no schema appears here at all; the end-to-end block below is where
// the two meet.
const stepOf = (format: 'json' | 'form'): Step => {
  const step = (body(format) as unknown as ScopeExtensionValue).step
  if (step === undefined) throw new Error('the body channel must contribute a step')
  return step
}

// Run one step against a ctx and report the delta it handed inward.
const only = async (step: Step, ctx: object): Promise<unknown> => {
  let delta: unknown
  await step({}, ctx, async (d) => {
    delta = d
    return { ok: true, value: undefined, intent: undefined, effects: {} }
  })
  return delta
}

const jsonReq = (b: unknown) =>
  new Request('http://x/', {
    method: 'POST',
    body: JSON.stringify(b),
    headers: { 'content-type': 'application/json' },
  })

describe('body — the step, in isolation', () => {
  it("body('json') parses the JSON body onto the entry", async () => {
    expect(await only(stepOf('json'), { request: jsonReq({ title: 'Hello' }) })).toEqual({
      body: { title: 'Hello' },
    })
  })

  it("body('form') parses a form onto the SAME entry", async () => {
    const fd = new FormData()
    fd.set('email', 'user@example.com')
    const out = await only(stepOf('form'), {
      request: new Request('http://x/', { method: 'POST', body: fd }),
    })
    expect(out).toEqual({ body: { email: 'user@example.com' } })
  })

  // The two halves of a body read fail for opposite reasons, and the error
  // convention sends them opposite ways (principle 3).
  it('collapses malformed JSON to undefined — the client mistake, for a schema to report', async () => {
    const out = await only(stepOf('json'), {
      request: new Request('http://x/', { method: 'POST', body: '{oops' }),
    })
    expect(out).toEqual({ body: undefined })
  })

  it('THROWS when the request stream dies, which is not the client`s mistake', async () => {
    const dead = new Request('http://x/', {
      method: 'POST',
      body: new ReadableStream({
        start(c) {
          c.error(new Error('socket reset'))
        },
      }),
      // `duplex` is required for a stream body and missing from the DOM lib.
      ...({ duplex: 'half' } as object),
    })
    // A returned 422 here would tell the client its payload was malformed when
    // what actually broke is the connection — a 5xx hidden behind a 4xx.
    await expect(only(stepOf('json'), { request: dead })).rejects.toThrow('socket reset')
  })
})

describe('body — the channel and validate, together', () => {
  const s = scope(http)
    .extend(body('json'))
    .extend(standardSchema)
    .validate('body', z.object({ title: z.string() }))
    .handle((_d: {}, ctx) => ({ title: ctx.body.title }))

  const run = (b: unknown) =>
    s<{}, 'body'>({}, { request: jsonReq(b), params: {} })

  it('hands the leaf the validated body', async () => {
    const out = await run({ title: 'Hello' })
    expect(out.ok && out.value).toEqual({ title: 'Hello' })
  })

  it('a body the schema rejects is the RETURNED `invalid` branch, never a throw', async () => {
    const out = await run({ nope: 1 })
    expect(out.ok).toBe(false)
    expect(out.ok === false && 'invalid' in out && out.invalid.issues.length).toBeGreaterThan(0)
  })
})
