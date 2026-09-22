import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  resolve: { alias: {
    '@extensions/ordessa.contracts/contract.js': fileURLToPath(new URL('../../packages/foundation-contracts/src/contract.ts', import.meta.url)),
    '@extensions/ordessa.agent-contracts/contract.js': fileURLToPath(new URL('../../packages/agent-ui-contracts/src/contract.ts', import.meta.url)),
  } },
  test: { include: ['src/**/*.test.tsx', 'src/**/*.test.ts'] },
})
