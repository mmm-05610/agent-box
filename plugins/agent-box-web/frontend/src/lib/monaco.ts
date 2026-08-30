/**
 * Monaco bootstrap — wire the bundled monaco-editor into @monaco-editor/react
 * (no CDN) and register the TOML language (not shipped by default).
 */

import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new jsonWorker()
    return new editorWorker()
  },
}

loader.config({ monaco })

// Monaco ships basic languages for json/yaml but not TOML — register a
// lightweight Monarch tokenizer so config.toml gets syntax highlighting.
monaco.languages.register({ id: 'toml' })
monaco.languages.setMonarchTokensProvider('toml', {
  ignoreCase: false,
  tokenizer: {
    root: [
      [/^\[[^\]]*\]/, 'type.identifier'],
      [/#.*$/, 'comment'],
      [/"(?:[^"\\]|\\.)*"/, 'string'],
      [/'(?:[^'\\]|\\.)*'/, 'string'],
      [/\b(?:true|false)\b/, 'keyword'],
      [/[+-]?\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?/, 'number'],
      [/[A-Za-z0-9_-]+(?=\s*=)/, 'key'],
      [/=/, 'delimiter'],
    ],
  },
})
