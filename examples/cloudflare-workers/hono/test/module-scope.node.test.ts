import { createTestHarness } from 'wrangler'
import { describe, expect, it } from 'vitest'

// The rule this example exists to hold the runtime to: on Workers there is no
// asynchronous I/O outside a request, so an app may NOT be built while a module
// is being evaluated. That is why `buildOnce` is lazy (§36) — everywhere else
// the rule lives in a comment and nobody checks it.
//
// This file runs in NODE and drives real workers through `createTestHarness`,
// which starts them the way a deployment does: workerd evaluates the module
// graph itself, at isolate startup, outside any request. That is what makes the
// ban observable. Its sibling `surface.test.ts` runs INSIDE workerd through
// @cloudflare/vitest-plugin, which is the right tool for behaviour but cannot
// prove this one: the plugin evaluates modules through Vitest's module runner,
// from within a request, so module scope there is always an I/O context and a
// module-scope `fetch` goes happily through.
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

describe('the no-I/O-outside-a-request rule, as the runtime enforces it', () => {
  it('starts and serves the LAZY worker — the shipped bootstrap', async () => {
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

  it('REFUSES to start the eager worker, naming the disallowed operation', async () => {
    const { server, error } = await start('./wrangler.eager.jsonc')
    await server?.close()
    expect(error).toBeDefined()
    expect(error!.message).toMatch(/Disallowed operation called within global scope/)
  })
})
