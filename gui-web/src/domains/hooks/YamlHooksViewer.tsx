/**
 * Hermes Hooks Viewer — read-only summary of the `hooks:` section in
 * `config.yaml`. Each command can be expanded to read and display the
 * referenced script file content.
 *
 * Self-fetches the profile's config.yaml; the hooks section is edited in a
 * Monaco editor (yaml syntax) and merged back with the yaml library.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, CodeEditor } from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { readFile, saveFile } from '@/api/files'
import type { AgentType } from '@/api'
import { useAgentConfigs, useProfileConfigDir } from '@/hooks'
import { extractHooksFragment, mergeHooksIntoConfig, parseHooksSection } from './yamlHooks'

export function YamlHooksViewer({ profileName, agentType }: { profileName: string; agentType?: AgentType }) {
  const { t } = useTranslation()
  const configDir = useProfileConfigDir(profileName)
  // File name comes from the backend registry (resources.hooks.config_file).
  const { agentConfigs } = useAgentConfigs()
  const configFile = agentType ? agentConfigs?.[agentType]?.resources?.hooks?.config_file : undefined
  const configPath = configDir === null || !configFile ? null : `${configDir}/${configFile}`
  const [configYaml, setConfigYaml] = useState('')
  const [hooksBlock, setHooksBlock] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  // Self-fetch the profile's config.yaml; keep the hooks fragment editable.
  useEffect(() => {
    if (!configPath) return
    let cancelled = false
    readFile(configPath)
      .then((raw) => {
        if (cancelled) return
        setConfigYaml(raw)
        setHooksBlock(extractHooksFragment(raw))
      })
      .catch(() => { if (!cancelled) { setConfigYaml(''); setHooksBlock('') } })
    return () => { cancelled = true }
  }, [configPath])

  const handleSaveHooks = useCallback(async () => {
    if (!configPath) return
    setSaving(true)
    try {
      // Parse the full config, replace the hooks field, serialize with yaml.
      let next: string
      try {
        next = mergeHooksIntoConfig(configYaml, hooksBlock)
      } catch {
        // Invalid YAML in the fragment — keep the editor content as-is.
        toast({ type: 'error', message: t('hooksViewer.toast.invalidYaml') })
        return
      }
      const ok = await saveFile(configPath, next)
      if (!ok) throw new Error(t('hooksViewer.saveReturnedFalse'))
      const fresh = await readFile(configPath).catch(() => '')
      setConfigYaml(fresh)
      setHooksBlock(extractHooksFragment(fresh))
      toast({ type: 'success', message: t('hooksViewer.toast.saved') })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : t('hooksViewer.toast.failed') })
    } finally {
      setSaving(false)
    }
  }, [configPath, configYaml, hooksBlock, toast])

  // Resolve hook command paths. config.yaml hook commands are written as the
  // bwrap-mounted config dir (e.g. /home/<user>/.hermes/hooks/foo.sh); on the
  // real filesystem they live under the profile's configDir. The mount
  // prefix comes from the backend registry (runtime.config_dir, expanded at
  // load) — the frontend doesn't hardcode any agent path.
  const resolvePath = useCallback((command: string) => {
    const mountPrefix = agentType ? agentConfigs?.[agentType]?.runtime?.config_dir : undefined
    if (mountPrefix && command.startsWith(mountPrefix + '/')) {
      return (configDir ?? '').replace(/\/+$/, '') + '/' + command.slice(mountPrefix.length + 1)
    }
    return command
  }, [configDir, agentType, agentConfigs])

  const phases = useMemo(() => parseHooksSection(hooksBlock), [hooksBlock])
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
          Object.keys(phases).map((phase) => {
            const entries = phases[phase] ?? []
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
        {/* Hooks fragment editor — Monaco with yaml syntax */}
        <div className="space-y-2 border-t border-border/40 pt-3">
          <h4 className="text-sm font-medium text-foreground">{t('hooksViewer.editBlock')}</h4>
          <div className="overflow-hidden rounded-md ring-1 ring-border/60">
            <CodeEditor
              language="yaml"
              value={hooksBlock}
              onChange={setHooksBlock}
              height={240}
              ariaLabel={t('hooksViewer.editBlock')}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveHooks} disabled={saving || !configPath}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
