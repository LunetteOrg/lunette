import { env, exports } from 'cloudflare:workers'
import { beforeAll, describe, expect, it } from 'vitest'

// The mounted SURFACE, one request at a time, inside workerd. What makes this
// file worth having is not what it asserts — the Hono entry asserts the same —
// but WHAT IS UNDER IT: an Express app, on `node:http` emulated by the runtime,
// served through `httpServerHandler`, with the Node pack unchanged.
const worker = exports.default
const links = env.LINKS

beforeAll(async () => {
  await links.put('home', 'https://workers.cloudflare.com')
  await links.put('docs', 'https://developers.cloudflare.com/workers')
})

describe('the Express pack, unchanged, serving from a Worker', () => {
  it('serves a leaf value, built from what the binding held', async () => {
    const res = await worker.fetch('https://example.com/links')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { links: { slug: string; url: string }[] }
    expect(body.links).toEqual(
      expect.arrayContaining([
        { slug: 'home', url: 'https://workers.cloudflare.com' },
        { slug: 'docs', url: 'https://developers.cloudflare.com/workers' },
      ]),
    )
  })

  // `toWebRequest` — the pack's IncomingMessage → Request lift — running on a
  // request the Workers runtime synthesised. Params are validated at runtime by
  // `runScope` (Express ships no native validator), so this is the fold's own
  // path, not the host's.
  it('validates the route param and serves the leaf', async () => {
    const res = await worker.fetch('https://example.com/links/home')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      link: { slug: 'home', url: 'https://workers.cloudflare.com' },
    })
  })

  // `renderOutcome` writing an abort's ResponseIntent onto a ServerResponse the
  // runtime emulates.
  it('turns a returned domain abort into a 404', async () => {
    const res = await worker.fetch('https://example.com/links/nope')
    expect(res.status).toBe(404)
  })

  // THE test this entry exists for, on the write side. No express.json(), so the
  // body arrives through `toWebRequest`'s streaming branch — the Node request
  // object handed to `new Request` as its body, with `duplex: 'half'` — on a
  // `node:http` server the Workers runtime emulates. It is the least-verified
  // path of the Node pack on this runtime, and the one where an emulation is
  // most likely to diverge.
  it('reads a JSON body streamed through the emulated node:http request', async () => {
    const res = await worker.fetch('https://example.com/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'created', url: 'https://example.com/created' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      link: { slug: 'created', url: 'https://example.com/created' },
    })

    // and the app sees its own write
    const read = await worker.fetch('https://example.com/links/created')
    expect(read.status).toBe(200)
  })

  it('returns the domain error for a slug already taken', async () => {
    const again = await worker.fetch('https://example.com/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'home', url: 'https://example.com/dup' }),
    })
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({ error: 'slug-taken' })
  })

  // The declared channel's own validation, before the leaf runs.
  it('rejects a body that fails the schema with a 422', async () => {
    const res = await worker.fetch('https://example.com/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: '', url: 'not-a-url' }),
    })
    expect(res.status).toBe(422)
  })

  // The bindings reached the app the ONLY way they can on this entry: through
  // `cloudflare:workers` in the config module. There is no `c.env` on a
  // node:http path for a `seedFrom(hostEnv)` to receive.
  it('serves the environment, which could only have come from the config module', async () => {
    const res = await worker.fetch('https://example.com/about')
    expect(res.status).toBe(200)
    const about = (await res.json()) as { label: string; keyId: string }
    expect(about.label).toBe('express on workers')
    expect(about.keyId).toMatch(/^[0-9a-f]{8}$/)
  })
})
