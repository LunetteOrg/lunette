import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Tests are CO-LOCATED with the source in `src/` (next to what they cover).
    // `test/` is for the ones that are ABOUT the design rather than about a
    // file — the measured limits and the spikes — and it is included here so
    // the gate is the same one, not `tsc --noEmit` by itself. A spike belongs
    // there only while it is being measured: what it establishes is written
    // beside the code it shapes, and the globs stay so the next one has a
    // place to land.
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts', 'test/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
})
