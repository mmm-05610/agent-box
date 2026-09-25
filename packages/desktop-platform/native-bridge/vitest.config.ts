import { defineConfig } from 'vitest/config'

// Package-local runner: root aggregation into `npm test` is FC's product-assembly call.
export default defineConfig({ test: { include: ['src/**/*.test.ts'], maxWorkers: 1 } })
