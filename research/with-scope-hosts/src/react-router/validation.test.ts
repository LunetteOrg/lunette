import { describe, expect, it } from 'vitest'
import { scope } from '@lntt/scope'
import { z } from 'zod'
import { jsonBody, validated } from './validation.ts'
import { reactRouterCarrier } from './carrier.ts'

const Schema = z.object({ title: z.string().min(1) })

const request = (json: () => Promise<unknown>): Request => {
  const req = new Request('http://localhost/posts', { method: 'POST' })
  req.json = json
  return req
}

describe('jsonBody + validated', () => {
  const h = scope(reactRouterCarrier)
    .step(jsonBody)
    .step(validated(Schema))
    .step(async (_app: {}, ctx: { readonly body: { title: string } }) => `got ${ctx.body.title}`)

  it('returns a data() envelope with status 422, on a well-formed but invalid body', async () => {
    const out = (await h({}, { request: request(() => Promise.resolve({ title: '' })), params: {} })) as {
      init?: { status?: number }
    }
    expect(out.init?.status).toBe(422)
  })

  it('passes the parsed body through, on a valid one', async () => {
    const out = await h({}, { request: request(() => Promise.resolve({ title: 'ok' })), params: {} })
    expect(out).toBe('got ok')
  })

  it('a genuine read failure (malformed JSON, or worse) THROWS from `jsonBody` — `validated` never sees it', async () => {
    await expect(
      h({}, { request: request(() => Promise.reject(new SyntaxError('Unexpected token'))), params: {} }),
    ).rejects.toBeInstanceOf(SyntaxError)
  })
})
