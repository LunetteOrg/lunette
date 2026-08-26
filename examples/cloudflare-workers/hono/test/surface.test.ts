import { env, exports } from 'cloudflare:workers'
import { beforeAll, describe, expect, it } from 'vitest'

// The worker under test, reached through the runtime's own dispatch. `env` is
// the SAME module the app's `config/env.ts` reads — the test sees the bindings
// from where the app sees them.
const worker = exports.default
const links = env.LINKS

// The mounted SURFACE, one request at a time, driven through `SELF` — the real
// worker, loaded by workerd from `wrangler.jsonc`, answering over the runtime's
// own fetch path. What the Node entries prove against a Node server, this proves
// against the runtime the example is about. Its sibling
// `module-scope.node.test.ts` proves the one thing this vantage point cannot.
//
// The KV binding is Miniflare's: real storage, no account, no credentials.
// Seeded BEFORE the first request because the store layer reads it during the
// build, and the build happens on that first request (§36).
beforeAll(async () => {
  await links.put('home', 'https://workers.cloudflare.com')
  await links.put('docs', 'https://developers.cloudflare.com/workers')
})

describe('the links chain on Hono, served from a Worker', () => {
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

  it('validates the route param and serves the leaf', async () => {
    const res = await worker.fetch('https://example.com/links/home')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      link: { slug: 'home', url: 'https://workers.cloudflare.com' },
    })
  })

  it('turns a returned domain abort into a 404', async () => {
    const res = await worker.fetch('https://example.com/links/nope')
    expect(res.status).toBe(404)
  })

  // The WRITE: a declared `.body` channel, validated by the fold, reaching a leaf
  // that writes KV and the in-memory store both.
  it('reads a declared JSON body and writes through', async () => {
    const res = await worker.fetch('https://example.com/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'created', url: 'https://example.com/created' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      link: { slug: 'created', url: 'https://example.com/created' },
    })
    expect(await links.get('created')).toBe('https://example.com/created')
  })

  it('returns the domain error for a slug already taken', async () => {
    const res = await worker.fetch('https://example.com/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'home', url: 'https://example.com/dup' }),
    })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'slug-taken' })
  })

  it('rejects a body that fails the schema with a 422', async () => {
    const res = await worker.fetch('https://example.com/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: '', url: 'not-a-url' }),
    })
    expect(res.status).toBe(422)
  })

  // The values `config/env.ts` read from `cloudflare:workers` at module scope,
  // travelling the whole way: into the seed, through the layer, out of the
  // chain's public surface and into a leaf's response.
  it('serves the environment the config module read from cloudflare:workers', async () => {
    const res = await worker.fetch('https://example.com/about')
    expect(res.status).toBe(200)
    const about = (await res.json()) as { label: string; keyId: string }
    expect(about.label).toBe('hono on workers')
    expect(about.keyId).toMatch(/^[0-9a-f]{8}$/)
  })

  // Build-once, observed from outside: a link written to KV AFTER the first
  // request does not appear, because the app was built once for the isolate and
  // the store was read then (§36). The same property that makes #39 a real
  // problem is what this asserts.
  it('builds once per isolate — a later KV write is not picked up', async () => {
    const before = await (await worker.fetch('https://example.com/links')).json()
    await links.put('late', 'https://example.com/added-after-the-build')
    const after = await (await worker.fetch('https://example.com/links')).json()
    expect(after).toEqual(before)
    expect((after as { links: { slug: string }[] }).links.map((l) => l.slug)).not.toContain('late')
  })
})
