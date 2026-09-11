import { defineConfig, mergeConfig } from 'vitest/config'
import shared from '../../vitest.shared.ts'

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
      typecheck: {
        enabled: true,
        include: ['src/**/*.test-d.ts', 'test/**/*.test-d.ts'],
        tsconfig: './tsconfig.json',
      },
    },
  }),
)
