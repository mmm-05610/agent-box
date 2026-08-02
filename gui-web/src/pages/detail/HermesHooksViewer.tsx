/**
 * Hermes Hooks Viewer — read-only summary of the `hooks:` section in
 * `config.yaml`. Each command can be expanded to read and display the
 * referenced script file content.
 *
 * Edits happen in the Storage tab.
 */

import { useCallback, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { readFile } from '@/api/files'

interface HookEntry {
  command: string
}

type HookPhases = Record<string, HookEntry[]>

/**
 * Extract phases + commands from `hooks:` block.
 *   hooks:
 *     pre_llm_call:
 *     - command: /path/to/script.sh
 */
function extractHooks(yaml: string): HookPhases {
  const lines = yaml.split(/\r?\n/)
  const phases: HookPhases = {}

  let inHooks = false
  let currentPhase: string | null = null
  const phaseRe = /^  ([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/
  const commandRe = /^    -?\s*command\s*:\s*(.+?)\s*$/

  for (const raw of lines) {
    const stripped = raw.replace(/\s+#.*$/, '')
    if (/^hooks\s*:\s*$/.test(stripped)) { inHooks = true; continue }
    if (!inHooks) continue
    if (/^[A-Za-z_]/.test(raw)) break

    const phaseMatch = stripped.match(phaseRe)
    if (phaseMatch) {
      currentPhase = phaseMatch[1]
      phases[currentPhase] = phases[currentPhase] ?? []
      continue
    }

    const cmdMatch = stripped.match(commandRe)
    if (cmdMatch && currentPhase) {
      const value = cmdMatch[1].trim().replace(/^(['"])(.*)\1$/, '$2')
      phases[currentPhase].push({ command: value })
    }
  }
  return phases
}

const PHASE_ORDER = ['pre_llm_call', 'post_llm_call', 'pre_tool_use', 'post_tool_use']

function phaseOrder(a: string, b: string): number {
  const ai = PHASE_ORDER.indexOf(a)
  const bi = PHASE_ORDER.indexOf(b)
  if (ai === -1 && bi === -1) return a.localeCompare(b)
  if (ai === -1) return 1
  if (bi === -1) return -1
  return ai - bi
}

export function HermesHooksViewer({
  configYaml,
  configDir,
  onRefresh: _onRefresh,
}: {
  configYaml: string
  configDir: string
  /** Future hook for the parent to re-fetch config.yaml after external edits.
   *  The component currently re-renders when its parent bumps `key`, so this
   *  prop is declared but not yet consumed inside. */
  onRefresh?: () => void
}) {
  const { t } = useTranslation()
  // Resolve hook command paths. Paths like /home/maoqh/.hermes/hooks/foo.sh
  // refer to the bwrap mount — on the real filesystem they live under
  // configDir/hooks/. Translate the prefix.
  const resolvePath = useCallback((command: string) => {
    if (command.startsWith('/home/maoqh/.hermes/')) {
      return configDir.replace(/\/+$/, '') + '/' + command.slice('/home/maoqh/.hermes/'.length)
    }
    return command
  }, [configDir])
  const phases = useMemo(() => extractHooks(configYaml), [configYaml])
  const totalHooks = useMemo(
    () => Object.values(phases).reduce((sum, entries) => sum + entries.length, 0),
    [phases],
  )

  // Expand/collapse per command — key is "phase:index"
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [scriptContents, setScriptContents] = useState<Record<string, string>>({})
  const [loadingScript, setLoadingScript] = useState<Set<string>>(new Set())

  const toggleExpand = useCallback(async (phase: string, index: number, command: string) => {
    const key = `${phase}:${index}`
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
        return next
      }
      // Load script content on expand if not already cached
      if (!scriptContents[key]) {
        setLoadingScript((l) => new Set(l).add(key))
        readFile(resolvePath(command))
          .then((content) => setScriptContents((s) => ({ ...s, [key]: content })))
          .catch(() => setScriptContents((s) => ({ ...s, [key]: t('hooksViewer.failedToRead') })))
          .finally(() => setLoadingScript((l) => {
            const next = new Set(l)
            next.delete(key)
            return next
          }))
      }
      next.add(key)
      return next
    })
  }, [scriptContents])

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('hooksViewer.title')}{' '}
          <span className="text-muted-foreground font-normal">
            {t('hooksViewer.count', {
              count: totalHooks,
              phases: Object.keys(phases).length,
              phaseWord: t(Object.keys(phases).length === 1 ? 'hooksViewer.phase' : 'hooksViewer.phases'),
            })}
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          <Trans
            i18nKey="hooksViewer.subtitle"
            components={{ code: <code className="font-mono" /> }}
          />
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.keys(phases).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="hooksViewer.empty"
              components={{ code: <code className="font-mono" /> }}
            />
          </p>
        ) : (
          Object.keys(phases).sort(phaseOrder).map((phase) => {
            const entries = phases[phase]
            return (
              <div key={phase} className="rounded-lg bg-card ring-1 ring-border/60">
                <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <h4 className="font-mono text-sm font-medium text-foreground">{phase}</h4>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground ring-1 ring-inset ring-border">
                      {t(entries.length === 1 ? 'hooksViewer.commandsOne' : 'hooksViewer.commands', { count: entries.length })}
                    </span>
                  </div>
                  <Badge variant="primary">{t('hooksViewer.hooksBadge')}</Badge>
                </div>
                <ul className="divide-y divide-border/40">
                  {entries.map((entry, index) => {
                    const key = `${phase}:${index}`
                    const isExpanded = expanded.has(key)
                    const isLoading = loadingScript.has(key)
                    return (
                      <li key={index}>
                        <div className="flex items-center gap-3 px-4 py-2.5">
                          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                            {index + 1}
                          </span>
                          <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground/90" title={entry.command}>
                            {entry.command}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-expanded={isExpanded}
                            onClick={() => toggleExpand(phase, index, entry.command)}
                          >
                            {isExpanded ? t('common.hide') : t('common.details')}
                          </Button>
                        </div>
                        {isExpanded && (
                          <div className="border-t border-border/40 px-4 py-3">
                            <p className="mb-2 text-xs font-medium text-foreground">{t('hooksViewer.scriptContent')}</p>
                            {isLoading ? (
                              <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
                            ) : (
                              <pre className="max-h-64 overflow-auto rounded-md bg-muted/60 p-3 font-mono text-xs text-foreground/85 whitespace-pre-wrap">
                                {scriptContents[key] ?? ''}
                              </pre>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
