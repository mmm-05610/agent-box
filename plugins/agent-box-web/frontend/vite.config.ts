import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // The Local Web Host serves the production bundle from here.
  base: './',
  // Vitest config — `test` is not part of Vite's UserConfig type.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
  build: {
    // The wheel consumes this exact tree. Vite's emptyOutDir removes stale
    // bundles before every build, so no manual copy step can drift.
    outDir: '../src/agent_box_web/_static',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
} as UserConfig)
