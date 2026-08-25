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
