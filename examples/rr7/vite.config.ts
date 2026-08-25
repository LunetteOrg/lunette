import { reactRouter } from '@react-router/dev/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [reactRouter()],
  ssr: {
    // Keep the workspace packages OUT of the server bundle. Vite bundles linked
    // deps by default, which would give the built server its own copy of
    // @lntt/example-app — a second chain, and a second in-memory database. The
    // e2e test drives the same modules the server does.
    external: [
      '@lntt/example-app',
      '@lntt/integration',
      '@lntt/scope',
      '@lntt/wire',
      // PGlite ships a wasm data file it resolves relative to its own module,
      // so bundling it breaks the lookup. Externalizing keeps it — and drizzle —
      // as ordinary node imports at runtime.
      '@electric-sql/pglite',
      'drizzle-orm',
      'zod',
    ],
  },
})
