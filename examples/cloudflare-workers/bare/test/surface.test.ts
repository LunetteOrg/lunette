import { env, exports } from 'cloudflare:workers'
import { beforeAll, describe, expect, it } from 'vitest'

// The mounted surface of a worker with NO pack. The assertions are deliberately
// the same ones `../hono/test/surface.test.ts` makes of the packed entry over
// the same chain — written out rather than compared across packages, so neither
// example depends on the other (#40). If the two ever diverge, one of them is
// wrong about what a pack does.
const worker = exports.default
const links = env.LINKS

beforeAll(async () => {
  await links.put('home', 'https://workers.cloudflare.com')
  await links.put('docs', 'https://developers.cloudflare.com/workers')
})

describe('runScope by hand, served from a Worker', () => {
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

  // Params come from the hand-written router, not from a host's matcher, and
  // `runScope` validates them at runtime — a bad one is a RETURNED 422.
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

  // The env the config module read from `cloudflare:workers`, travelling into
  // the seed and back out through the chain's public surface.
  it('serves the environment the config module read', async () => {
    const res = await worker.fetch('https://example.com/about')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ label: 'no pack at all' })
  })

  // The one job an adapter would have done. A scope's own 404 is the case above;
  // this one belongs to the router, and writing it is the whole difference.
  it('answers a path no scope claims — the router is ours here', async () => {
    const res = await worker.fetch('https://example.com/not-a-route')
    expect(res.status).toBe(404)
  })
})
