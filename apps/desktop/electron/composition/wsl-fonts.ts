/**
 * composition/wsl-fonts.ts — the WSL font fixup, extracted verbatim from
 * main.ts.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

import { isWslEnvironment } from '../bootstrap-platform'

import { rememberLog } from './log-buffer'

export function ensureWslWindowsFonts() {
  if (!isWslEnvironment()) {
    return
  }

  const fontsDir = ['/mnt/c/Windows/Fonts', '/mnt/c/windows/fonts'].find(candidate => {
    try {
      return fs.statSync(candidate).isDirectory()
    } catch {
      return false
    }
  })

  if (!fontsDir) {
    return
  }

  try {
    const confDir = path.join(app.getPath('home'), '.config', 'fontconfig', 'conf.d')
    const confPath = path.join(confDir, '99-hermes-wsl-windows-fonts.conf')
    let existing = ''

    try {
      existing = fs.readFileSync(confPath, 'utf8')
    } catch {
      existing = ''
    }

    if (existing.includes(fontsDir)) {
      return
    }

    fs.mkdirSync(confDir, { recursive: true })
    fs.writeFileSync(
      confPath,
      `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <dir>${fontsDir}</dir>\n</fontconfig>\n`
    )
    rememberLog(`[fonts] wired WSL Windows fonts for renderer: ${fontsDir}`)

    const cache = spawn('fc-cache', ['-f', fontsDir], { detached: true, stdio: 'ignore' })
    cache.on('error', () => undefined)
    cache.unref()
  } catch (error) {
    rememberLog(`[fonts] WSL font setup skipped: ${error.message}`)
  }
}

