import { defineConfig, mergeConfig } from 'vitest/config'
import shared from '../../vitest.shared.ts'

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: ['app/**/*.test.ts', 'app/**/*.test.tsx'],
    },
  }),
)
