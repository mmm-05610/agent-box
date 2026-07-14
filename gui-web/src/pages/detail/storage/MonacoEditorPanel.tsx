import Editor, { loader } from '@monaco-editor/react'
import { useCallback, useEffect, useState } from 'react'

const MONACO_VERSION = '0.52.0'
// Vite closeBundle hook copies node_modules/monaco-editor/min/vs into
// dist/monaco/vs/, so the loader root lives at /monaco/vs/loader.js.
const LOCAL_VS_PATH = '/monaco/vs'
const LOCAL_LOADER_PROBE = `${LOCAL_VS_PATH}/loader.js`
const CDN_VS_PATH = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs`

let configured = false

/**
 * Probe the local Monaco bundle. Returns true if /monaco/vs/loader.js is
 * reachable, false otherwise (or probe errored).
 *
 * In dev (vite dev server), the closeBundle hook never ran — the static
 * file isn't there. In prod (PyWebView + vite build), the copy *was* run
 * but static serving depends on the host. Treating both as "fall back to
 * CDN if 404" is robust.
 */
async function probeLocalMonaco(): Promise<boolean> {
  try {
    const res = await fetch(LOCAL_LOADER_PROBE, { method: 'HEAD', cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

async function configureMonaco() {
  if (configured) return
  configured = true
  const localOk = await probeLocalMonaco()
  loader.config({ paths: { vs: localOk ? LOCAL_VS_PATH : CDN_VS_PATH } })
}

export function detectLanguage(path: string): string {
  if (path.endsWith('.json') || path.endsWith('.jsonc')) return 'json'
  if (path.endsWith('.md')) return 'markdown'
  if (path.endsWith('.toml')) return 'ini'
  if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'yaml'
  return 'plaintext'
}

export interface MonacoEditorPanelProps {
  value: string
  language: string
  onChange: (next: string) => void
  onMount?: () => void
}

/**
 * Defers Monaco mount until the loader has been configured with either the
 * local or the CDN path. Loading state shows the spec's "Loading editor..."
 * placeholder during the probe + config round trip.
 */
export function MonacoEditorPanel({ value, language, onChange, onMount }: MonacoEditorPanelProps) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    configureMonaco().then(() => {
      if (!cancelled) setReady(true)
    })
    return () => { cancelled = true }
  }, [])

  const handleMount = useCallback(() => onMount?.(), [onMount])

  if (!ready) {
    return <p className="p-4 text-xs text-muted-foreground">Loading editor...</p>
  }
  return (
    <Editor
      height="100%"
      theme="vs-dark"
      language={language}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={handleMount}
      options={{
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        tabSize: 2,
      }}
      loading={<p className="p-4 text-xs text-muted-foreground">Loading editor...</p>}
    />
  )
}
