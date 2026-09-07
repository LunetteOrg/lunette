import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts', 'test/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
})
