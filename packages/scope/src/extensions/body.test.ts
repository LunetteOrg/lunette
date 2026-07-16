import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { scope } from '../scope.ts'
import { runFold } from '../run-fold.ts'
import type { RequestCarrier } from '../carrier.ts'
import { body } from './body.ts'

// The `body` extension pushes a `prepare` step that reads the RAW carrier request
// and validates the channel into ctx — exercised here through `runFold`.

describe('body — runtime parse + validate', () => {
  const jsonReq = (b: unknown) =>
    new Request('http://x/', {
      method: 'POST',
      body: JSON.stringify(b),
      headers: { 'content-type': 'application/json' },
    })

  it('.body parses + validates the JSON body into ctx.body', async () => {
    const handler = scope()
      .extend(body)
      .body(z.object({ title: z.string() }))
      .handle((_d: {}, ctx) => ({ echoed: ctx.body.title }))

    const ok = await runFold<RequestCarrier, { echoed: string }>(
      handler,
      {},
      { request: jsonReq({ title: 'Hello' }) },
      {},
    )
    expect(ok).toEqual({ ok: true, value: { echoed: 'Hello' }, cookies: [] })
  })

  it('a body missing the required field is a RETURNED 422 (the error convention)', async () => {
    const handler = scope()
      .extend(body)
      .body(z.object({ title: z.string() }))
      .handle((_d: {}, ctx) => ({ echoed: ctx.body.title }))

    const bad = await runFold<RequestCarrier, { echoed: string }>(
      handler,
      {},
      { request: jsonReq({ nope: 1 }) },
      {},
    )
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.abort.intent).toMatchObject({ kind: 'status', status: 422 })
  })

  it('.form parses + validates the form body into ctx.form', async () => {
    const handler = scope()
      .extend(body)
      .form(z.object({ email: z.string() }))
      .handle((_d: {}, ctx) => ({ to: ctx.form.email }))

    const fd = new FormData()
    fd.set('email', 'user@example.com')
    const out = await runFold<RequestCarrier, { to: string }>(
      handler,
      {},
      { request: new Request('http://x/', { method: 'POST', body: fd }) },
      {},
    )
    expect(out).toEqual({ ok: true, value: { to: 'user@example.com' }, cookies: [] })
  })
})
