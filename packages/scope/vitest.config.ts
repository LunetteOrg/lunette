import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Tests are CO-LOCATED with the source in `src/` (next to what they cover).
    // `test/` is for the ones that are ABOUT the design rather than about a
    // file — the measured limits and the spikes — and it is included here so
    // the gate is the same one, not `tsc --noEmit` by itself. It holds nothing
    // today: the one spike it carried modelled the two-branch outcome §42
    // retired, and its findings live beside the code they shaped
    // (`IntentKeysOf`, `ReturnGate`) and in decision 40. The globs stay because
    // the next measured limit goes there, not because something is there now.
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts', 'test/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
})
