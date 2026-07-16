import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Tests are CO-LOCATED with the source in `src/` (next to what they cover).
    include: ['src/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
})
