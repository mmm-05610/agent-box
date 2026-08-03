/**
 * CodeEditor — thin Monaco wrapper used by config editors.
 *
 * The local monaco-editor bundle (see @/lib/monaco) is imported lazily on
 * first render — this keeps monaco out of the static module graph (tests
 * and non-editor screens never pay for it), and follows the app's
 * light/dark theme class.
 */

import { useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'

export interface CodeEditorProps {
  language: 'json' | 'yaml' | 'toml'
  value: string
  onChange?: (value: string) => void
  height?: number
  ariaLabel?: string
}

export function CodeEditor({ language, value, onChange, height = 240, ariaLabel }: CodeEditorProps) {
  const [ready, setReady] = useState(false)
  const [theme, setTheme] = useState<'vs' | 'vs-dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs',
  )

  useEffect(() => {
    let cancelled = false
    void import('@/lib/monaco').then(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
  }, [])

  // The settings page toggles the `dark` class directly — mirror it.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  if (!ready) {
    return (
      <div className="flex h-40 items-center justify-center bg-muted/40 text-xs text-muted-foreground">
        Loading editor…
      </div>
    )
  }

  return (
    <Editor
      language={language}
      theme={theme}
      value={value}
      onChange={(next) => onChange?.(next ?? '')}
      height={height}
      aria-label={ariaLabel}
      options={{
        minimap: { enabled: false },
        fontSize: 12,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        tabSize: 2,
        wordWrap: 'on',
        renderWhitespace: 'selection',
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      }}
    />
  )
}
