import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { isAbort } from '../abort.ts'
import { unit } from '../schema.ts'
import type { Prepare, ScopeExtensionValue } from '../scope.ts'
import { body } from './body.ts'

// Unit test — the `body` extension in ISOLATION, no `scope()` / `runFold`. Drive
// its runtime contract directly: `.body`/`.form` push a `prepare` step; capture
// that step off a fake `rebuild` and run it against a bare carrier. This tests the
// parse-and-validate the extension OWNS, not the fold that composes it.
type Channels = {
  body(schema: z.ZodTypeAny): unknown
  form(schema: z.ZodTypeAny): unknown
}
const stepFor = (call: (m: Channels) => void): Prepare => {
  let step!: Prepare
  const methods = (body as unknown as ScopeExtensionValue).methods(
    { schema: unit, guards: [], prepare: [], sinks: [] },
    (s) => {
      step = s.prepare[s.prepare.length - 1]!
      return {}
    },
  ) as unknown as Channels
  call(methods)
  return step
}

const jsonReq = (b: unknown) =>
  new Request('http://x/', {
    method: 'POST',
    body: JSON.stringify(b),
    headers: { 'content-type': 'application/json' },
  })

describe('body — the prepare step (unit, off the fold)', () => {
  const bodyStep = stepFor((m) => m.body(z.object({ title: z.string() })))
  const formStep = stepFor((m) => m.form(z.object({ email: z.string() })))

  it('.body parses + validates the JSON body into { body }', async () => {
    expect(await bodyStep({ request: jsonReq({ title: 'Hello' }) })).toEqual({
      body: { title: 'Hello' },
    })
  })

  it('an invalid body is a RETURNED 422 abort, never a throw', async () => {
    const out = await bodyStep({ request: jsonReq({ nope: 1 }) })
    expect(isAbort(out)).toBe(true)
    if (isAbort(out)) expect(out.intent).toMatchObject({ kind: 'status', status: 422 })
  })

  it('.form parses + validates the form body into { form }', async () => {
    const fd = new FormData()
    fd.set('email', 'user@example.com')
    const out = await formStep({ request: new Request('http://x/', { method: 'POST', body: fd }) })
    expect(out).toEqual({ form: { email: 'user@example.com' } })
  })
})

// The two halves of a body read fail for opposite reasons, and the error
// convention sends them opposite ways (principle 3).
describe('body — reading vs parsing', () => {
  const bodyStep = stepFor((m) => m.body(z.object({ title: z.string() })))

  it('RETURNS a 422 for malformed JSON, which is the client mistake', async () => {
    const out = await bodyStep({
      request: new Request('http://x/', { method: 'POST', body: '{oops' }),
    })
    expect(isAbort(out)).toBe(true)
    if (isAbort(out)) expect(out.intent).toMatchObject({ kind: 'status', status: 422 })
  })

  it('THROWS when the request stream dies, which is not', async () => {
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
    await expect(bodyStep({ request: dead })).rejects.toThrow('socket reset')
  })
})
