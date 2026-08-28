import { createTestHarness } from 'wrangler'
import { describe, expect, it } from 'vitest'

// Two things this file settles, both of which had to be run rather than assumed.
//
// One: `app.listen()` at module scope. It was an open question whether an
// emulated node:http server trips the no-I/O-outside-a-request ban. It does not
// — the lazy worker below starts and serves, and `src/server.ts` calls `listen`
// while the module is being evaluated. Nothing is opened; a port is registered.
//
// Two: the ban itself still bites, on the same runtime, for the thing that
// really is I/O. `test/fixture/eager-worker.ts` is this entry with the build
// moved out of the thunk, and the runtime refuses to start it.
//
// This runs in NODE: `createTestHarness` starts real workers from outside, so
// workerd evaluates the module graph itself, at isolate startup, outside any
// request. Its sibling `surface.test.ts` runs inside workerd through
// @cloudflare/vitest-plugin, which cannot see this because it loads modules from
// within a request.
const start = async (configPath: string) => {
  const server = createTestHarness({ workers: [{ configPath }] })
  try {
    await server.listen()
    return { server, error: undefined }
  } catch (error) {
    await server.close().catch(() => {})
    return { server: undefined, error: error as Error }
  }
}

describe('a node:http server on Workers, and the rule it still answers to', () => {
  it('starts and serves — so app.listen() at module scope is allowed', async () => {
    const { server, error } = await start('./wrangler.jsonc')
    expect(error).toBeUndefined()
    try {
      const res = await server!.fetch('http://example.com/links')
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ links: expect.any(Array) })
    } finally {
      await server!.close()
    }
  })

  it('REFUSES the eager build — the KV read, not the emulated server', async () => {
    const { server, error } = await start('./wrangler.eager.jsonc')
    await server?.close()
    expect(error).toBeDefined()
    expect(error!.message).toMatch(/Disallowed operation called within global scope/)
  })
})
