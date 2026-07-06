import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['app/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['app/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
})
