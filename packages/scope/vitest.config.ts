import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Tests are CO-LOCATED with the source in `src/` (next to what they cover).
    // `test/` is for the ones that are ABOUT the design rather than about a
    // file — the measured limits and the spikes — and it is included here so
    // the gate is the same one, not `tsc --noEmit` by itself.
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts', 'test/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
})
