import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Per-glob overrides: React component tests need a DOM. Without this
    // they would run under the default node env and fail the moment they
    // touch React or react-dom.
    environmentMatchGlobs: [
      ['src/**/*.test.tsx', 'jsdom'],
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
