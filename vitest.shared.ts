import { defineConfig } from 'vitest/config'

// What every suite in this workspace shares: how `@lntt/*` imported BY NAME is
// resolved. By default the SOURCES — the packages' `exports` list this
// condition first — so a suite exercises the same surface a consumer gets
// without a build standing between an edit and its answer, and the condition
// published for others is one run here every day.
//
// `LNTT_SOURCE=off` drops it, and the same suites reach `dist` instead: the
// published entry points, resolved the way a consumer resolves them. That run
// answers a question the sources cannot — whether what we SHIP still is what
// the tests passed against.
const conditions = process.env.LNTT_SOURCE === 'off' ? [] : ['@lntt/source']

// Declared on BOTH sides: suites run through Vite's SSR pipeline, which
// resolves with `ssr.resolve.conditions` and would otherwise fall through to
// `import` — reaching `dist`, or failing when there is none.
export default defineConfig({
  resolve: {
    conditions,
  },
  ssr: {
    resolve: { conditions },
  },
})
