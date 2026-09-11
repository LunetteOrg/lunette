import { defineConfig, mergeConfig } from 'vitest/config'
import shared, { onSources } from '../../vitest.shared.ts'

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
      typecheck: {
        enabled: onSources,
        include: ['src/**/*.test-d.ts', 'test/**/*.test-d.ts'],
        tsconfig: './tsconfig.json',
      },
    },
  }),
)
