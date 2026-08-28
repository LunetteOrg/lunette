import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Two projects, for the reason spelled out in the Hono entry's config: the
// plugin runs test bodies INSIDE workerd and is the right place for behaviour,
// but it evaluates modules from within a request, so the no-I/O-at-module-scope
// ban is invisible to it. `createTestHarness` starts real workers the way a
// deployment does, which is the only vantage point that sees the ban.
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
