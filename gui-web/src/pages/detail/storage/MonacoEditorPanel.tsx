import Editor, { loader } from '@monaco-editor/react'
import { useCallback } from 'react'

const MONACO_VERSION = '0.52.0'
const LOCAL_VS_PATH = '/monaco'
const CDN_VS_PATH = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs`

let configured = false
function configureMonaco() {
  if (configured) return
  configured = true
  if (import.meta.env.PROD) {
    // Try local; if 404 the loader will fall back to CDN itself by failing
    loader.config({ paths: { vs: LOCAL_VS_PATH } })
  }
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

export function MonacoEditorPanel({ value, language, onChange, onMount }: MonacoEditorPanelProps) {
  configureMonaco()
  const handleMount = useCallback(() => onMount?.(), [onMount])
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
