import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// TWO projects, because the two things worth proving here need two different
// vantage points, and neither tool can do the other's job.
//
// `workerd` — @cloudflare/vitest-plugin runs the test bodies INSIDE workerd
// (Miniflare), with real bindings and `SELF.fetch`. That is the right place to
// prove BEHAVIOUR: routing, the fold, the abort mapping, the environment
// arriving from `cloudflare:workers`.
//
// `node` — the plugin loads modules through Vitest's module runner, from within
// a request, so under it module scope is always an I/O context: a module-scope
// `fetch()` succeeds and the no-I/O rule cannot be observed. `createTestHarness`
// starts a real worker the way a deployment does — workerd evaluating the module
// graph at isolate startup — so it is the only vantage point from which the ban
// is visible. It runs in Node, driving workers from outside.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
        test: { name: 'workerd', include: ['test/**/*.test.ts'], exclude: ['test/**/*.node.test.ts'] },
      },
      {
        test: { name: 'node', include: ['test/**/*.node.test.ts'], testTimeout: 30_000 },
      },
    ],
  },
})
