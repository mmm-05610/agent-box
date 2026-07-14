import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function copyDir(src: string, dest: string) {
  if (!existsSync(src)) return
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
  for (const name of readdirSync(src)) {
    const from = join(src, name)
    const to = join(dest, name)
    if (statSync(from).isDirectory()) copyDir(from, to)
    else copyFileSync(from, to)
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    {
      name: 'monaco-asset-pipeline',
      closeBundle() {
        const monacoSrc = 'node_modules/monaco-editor/min/vs'
        const monacoDest = 'dist/monaco/vs'
        if (existsSync(monacoSrc)) {
          copyDir(monacoSrc, monacoDest)
          console.log(`[monaco] copied to ${monacoDest}`)
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // PyWebView serves static files from here
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
