import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// One project: the tests run INSIDE workerd, with the real KV binding served by
// Miniflare. Unlike its neighbours this package has no `node` project, because
// it asserts no claim the plugin cannot see — the no-I/O-at-module-scope rule is
// proven against the identical chain in `../hono`, which carries the fixture
// worker the runtime refuses to start.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
})
