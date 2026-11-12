import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts', 'layers/*/tests/**/*.test.ts'] },
})
