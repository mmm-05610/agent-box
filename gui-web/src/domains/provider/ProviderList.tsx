/**
 * Provider List — Apply from Library + Config file viewer.
 *
 * Claude / Codex: single-provider overwrite.
 * Hermes / OpenCode: additive mode — multiple provider entries, Add / Remove.
 *
 * Library data via useLibrary; profile config files are read through the
 * api layer (config dir resolved from the profile).
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import {
  applyProvider, removeProfileProvider,
} from '@/api/providers'
import { readFile, saveFile } from '@/api/files'
import { ProviderIcon } from '@/components/ProviderIcon'
import { hasIcon } from '@/icons/extracted'
import { AGENT_TYPE_CONFIGS } from '@/api'
import { useLibrary, useProfileResources } from '@/hooks'
import type { AgentType } from '@/api'

// ── Icon helpers ──────────────────────────────────────────────────────────

const PROVIDER_ICON_ALIASES: Record<string, string> = {
  'claude official': 'claude', 'openai official': 'openai',
  'xiaomi mimo': 'xiaomimimo', 'zhipu glm': 'zhipu', 'anthropic claude': 'claude',
}

function resolveIconKey(name: string): string | undefined {
  const lower = name.toLowerCase()
  if (PROVIDER_ICON_ALIASES[lower] && hasIcon(PROVIDER_ICON_ALIASES[lower])) return PROVIDER_ICON_ALIASES[lower]
  if (hasIcon(lower)) return lower
  for (const word of lower.split(/[\s\-_]+/)) {
    if (word.length >= 3 && hasIcon(word)) return word
  }
  return undefined
}

// ── Types ─────────────────────────────────────────────────────────────────

interface ConfigFile { label: string; path: string; content: string }

interface ProviderListProps {
  agentType: AgentType
  profileName: string
}

/** Extract model.provider from a Hermes config.yaml to find the active provider. */
function parseActiveProvider(yamlContent: string): string | null {
  const m = yamlContent.match(/^\s+provider:\s*["']?([^"'\s]+)/m)
  return m?.[1] ?? null
}

// ── Component ─────────────────────────────────────────────────────────────

export function ProviderList({ agentType, profileName }: ProviderListProps) {
  const isAdditive = AGENT_TYPE_CONFIGS[agentType].provider_apply_mode === 'additive'
  const { toast } = useToast()

  // Library providers (from ACS)
  const { providers: libraryProviders } = useLibrary(agentType, ['providers'])
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null)

  // Profile-local providers (additive mode) + config dir (from the object hook)
  const {
    providers: profileProviders,
    configDir,
    refresh: refreshProfileProviders,
  } = useProfileResources(profileName)
  const [removingId, setRemovingId] = useState<string | null>(null)

  // Config file editing
  const [configFiles, setConfigFiles] = useState<ConfigFile[]>([])
  const [editedContents, setEditedContents] = useState<Record<string, string>>({})
  const [savingFile, setSavingFile] = useState<string | null>(null)

  const reloadConfigFiles = useCallback(async () => {
    if (!configDir) return
    const contents = await Promise.all(
      AGENT_TYPE_CONFIGS[agentType].config_files.map(async (filename) => {
        const content = await readFile(`${configDir}/${filename}`).catch(() => filename === 'settings.json' ? '{}' : '')
        return { label: filename, path: `${configDir}/${filename}`, content }
      })
    )
    setConfigFiles(contents)
  }, [configDir, agentType])

  useEffect(() => { void reloadConfigFiles() }, [reloadConfigFiles])

  // Detect active provider from config files (Claude / Codex)
  useEffect(() => {
    if (isAdditive) return
    if (agentType === 'claude') {
      const settingsFile = configFiles.find(f => f.label === 'settings.json')
      if (settingsFile) {
        try {
          const d = JSON.parse(settingsFile.content)
          setActiveProviderId(d._provider?.id ?? null)
        } catch { setActiveProviderId(null) }
      }
    } else if (agentType === 'codex') {
      const authFile = configFiles.find(f => f.label === 'auth.json')
      if (authFile && authFile.content.trim()) {
        // Find matching provider by comparing apiKey in auth
        const libProv = libraryProviders.find(p => {
          const auth = (p.settings as Record<string, unknown>)?.auth as Record<string, unknown> | undefined
          try { return JSON.parse(authFile.content).OPENAI_API_KEY === auth?.OPENAI_API_KEY } catch { return false }
        })
        setActiveProviderId(libProv?.id ?? null)
      }
    }
  }, [configFiles, agentType, isAdditive, libraryProviders])

  useEffect(() => {
    const init: Record<string, string> = {}
    for (const f of configFiles) init[f.path] = f.content
    setEditedContents(init)
  }, [configFiles[0]?.content ?? ''])

  const getEdited = (path: string) => editedContents[path] ?? configFiles.find(f => f.path === path)?.content ?? ''

  // ── Apply (single / additive) ─────────────────────────────────────────

  const handleApply = useCallback(async (providerId: string) => {
    setApplyingId(providerId)
    try {
      await applyProvider(profileName, providerId)
      if (!isAdditive) setActiveProviderId(providerId)
      if (isAdditive) await refreshProfileProviders()
      await reloadConfigFiles()
      const provider = libraryProviders.find(p => p.id === providerId)
      toast({ type: 'success', message: `${provider?.name ?? providerId} applied to ${profileName}` })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to apply provider' })
    } finally {
      setApplyingId(null)
    }
  }, [profileName, libraryProviders, toast, isAdditive, reloadConfigFiles, refreshProfileProviders])

  const handleRemove = useCallback(async (providerId: string) => {
    setRemovingId(providerId)
    try {
      await removeProfileProvider(profileName, providerId)
      await refreshProfileProviders()
      await reloadConfigFiles()
      const provider = profileProviders.find(p => p.id === providerId)
      toast({ type: 'success', message: `${provider?.name ?? providerId} removed` })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to remove provider' })
    } finally {
      setRemovingId(null)
    }
  }, [profileName, profileProviders, toast, reloadConfigFiles, refreshProfileProviders])

  // ── Save config file ────────────────────────────────────────────────────

  const handleSaveFile = useCallback(async (path: string) => {
    setSavingFile(path)
    try {
      const ok = await saveFile(path, editedContents[path] ?? '')
      if (!ok) throw new Error('Save returned false')
      await reloadConfigFiles()
      toast({ type: 'success', message: 'File saved' })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save file' })
    } finally {
      setSavingFile(null)
    }
  }, [editedContents, toast, reloadConfigFiles])

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Added Providers (additive only) ────────────────────────── */}
      {isAdditive && profileProviders.length > 0 && (() => {
        const hermesYaml = configFiles.find(f => f.label === 'config.yaml')?.content ?? ''
        const activeProvider = agentType === 'hermes' ? parseActiveProvider(hermesYaml) : null
        const hasActive = agentType === 'hermes'
        const isActive = (id: string) => activeProvider === id

        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Profile Providers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {profileProviders.map((pp) => {
                const icon = resolveIconKey(pp.name)
                const active = hasActive && isActive(pp.id)
                return (
                  <div key={pp.id}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${active ? 'border-accent bg-accent/5' : 'border-border bg-card'}`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <ProviderIcon icon={icon} name={pp.name} size={18} showFallback />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{pp.name}</div>
                      {pp.website_url && (
                        <span className="text-[10px] text-muted-foreground truncate block">
                          {pp.website_url.replace(/^https?:\/\//, '')}
                        </span>
                      )}
                    </div>
                    {hasActive && (
                      active ? (
                        <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">Active</span>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => handleApply(pp.id)} isLoading={applyingId === pp.id}>Activate</Button>
                      )
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleRemove(pp.id)} isLoading={removingId === pp.id}
                      className="text-destructive hover:text-destructive">
                      Remove
                    </Button>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })()}

      {/* ── Apply from Library ──────────────────────────────────────── */}
      {libraryProviders.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {isAdditive ? 'Add from Library' : 'Apply from Library'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {libraryProviders
              .filter(p => !isAdditive || !profileProviders.some(pp => pp.id === p.id))
              .map((p) => {
              const icon = resolveIconKey(p.name)
              const isActive = !isAdditive && activeProviderId === p.id
              return (
                <div key={p.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${isActive ? 'border-accent bg-accent/5' : 'border-border bg-card'}`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <ProviderIcon icon={icon} name={p.name} size={18} showFallback />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    {p.websiteUrl && (
                      <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-blue-500 hover:underline dark:text-blue-400 truncate block">
                        {p.websiteUrl.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </div>
                  {isActive ? (
                    <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">Active</span>
                  ) : (
                    <Button size="sm" isLoading={applyingId === p.id} onClick={() => handleApply(p.id)}>
                      {isAdditive ? 'Add' : 'Apply'}
                    </Button>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Config Files ────────────────────────────────────────────── */}
      {configFiles.map((file) => (
        <Card key={file.path}>
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-mono">{file.label}</CardTitle>
              <Button size="sm" variant="ghost" isLoading={savingFile === file.path}
                onClick={() => handleSaveFile(file.path)}>
                Save
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={getEdited(file.path)}
              onChange={(e) => setEditedContents(prev => ({ ...prev, [file.path]: e.target.value }))}
              rows={Math.min(24, Math.max(8, getEdited(file.path).split('\n').length + 2))}
              className="font-mono text-xs"
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
