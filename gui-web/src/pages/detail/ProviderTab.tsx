/**
 * Provider Tab — Apply from Library + Config file viewer.
 *
 * Claude / Codex: single-provider overwrite.
 * Hermes / OpenCode: additive mode — multiple provider entries, Add / Remove.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import {
  fetchProviders, applyProviderToProfile,
  fetchProfileProviders, removeProfileProvider,
  type ProfileProvider,
} from '@/api/providers'
import { saveFile } from '@/api/files'
import { ProviderIcon } from '@/components/ProviderIcon'
import { hasIcon } from '@/icons/extracted'
import type { AgentType, Provider } from '@/api'

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

export interface ConfigFile { label: string; path: string; content: string }

interface ProviderTabProps {
  agentType: AgentType
  profileName: string
  configFiles: ConfigFile[]
  onRefresh: () => void
}

const ADDITIVE_TYPES: AgentType[] = ['hermes', 'opencode']

/** Extract model.provider from a Hermes config.yaml to find the active provider. */
function parseActiveProvider(yamlContent: string): string | null {
  const m = yamlContent.match(/^\s+provider:\s*["']?([^"'\s]+)/m)
  return m ? m[1] : null
}

// ── Component ─────────────────────────────────────────────────────────────

export function ProviderTab({ agentType, profileName, configFiles, onRefresh }: ProviderTabProps) {
  const isAdditive = ADDITIVE_TYPES.includes(agentType)
  const { toast } = useToast()

  // Library providers (from ACS)
  const [libraryProviders, setLibraryProviders] = useState<Provider[]>([])
  const [applyingId, setApplyingId] = useState<string | null>(null)

  // Profile-local providers (additive mode)
  const [profileProviders, setProfileProviders] = useState<ProfileProvider[]>([])
  const [removingId, setRemovingId] = useState<string | null>(null)

  // Config file editing
  const [editedContents, setEditedContents] = useState<Record<string, string>>({})
  const [savingFile, setSavingFile] = useState<string | null>(null)

  useEffect(() => {
    fetchProviders(agentType).then(setLibraryProviders).catch(() => setLibraryProviders([]))
    if (isAdditive) {
      fetchProfileProviders(profileName).then(setProfileProviders).catch(() => setProfileProviders([]))
    }
  }, [agentType, profileName, isAdditive])

  useEffect(() => {
    const init: Record<string, string> = {}
    for (const f of configFiles) init[f.path] = f.content
    setEditedContents(init)
  }, [configFiles.length > 0 ? configFiles[0].content : ''])

  const getEdited = (path: string) => editedContents[path] ?? configFiles.find(f => f.path === path)?.content ?? ''

  // ── Apply (single / additive) ─────────────────────────────────────────

  const handleApply = useCallback(async (providerId: string) => {
    setApplyingId(providerId)
    try {
      await applyProviderToProfile(profileName, providerId)
      onRefresh()
      if (isAdditive) {
        const list = await fetchProfileProviders(profileName).catch(() => [] as ProfileProvider[])
        setProfileProviders(list)
      }
      const provider = libraryProviders.find(p => p.id === providerId)
      toast({ type: 'success', message: `${provider?.name ?? providerId} applied to ${profileName}` })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to apply provider' })
    } finally {
      setApplyingId(null)
    }
  }, [profileName, libraryProviders, onRefresh, toast, isAdditive])

  const handleRemove = useCallback(async (providerId: string) => {
    setRemovingId(providerId)
    try {
      await removeProfileProvider(profileName, providerId)
      setProfileProviders(prev => prev.filter(p => p.id !== providerId))
      const provider = profileProviders.find(p => p.id === providerId)
      toast({ type: 'success', message: `${provider?.name ?? providerId} removed` })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to remove provider' })
    } finally {
      setRemovingId(null)
    }
  }, [profileName, profileProviders, toast])

  // ── Save config file ────────────────────────────────────────────────────

  const handleSaveFile = useCallback(async (path: string) => {
    setSavingFile(path)
    try {
      const ok = await saveFile(path, editedContents[path] ?? '')
      if (!ok) throw new Error('Save returned false')
      toast({ type: 'success', message: 'File saved' })
      onRefresh()
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save file' })
    } finally {
      setSavingFile(null)
    }
  }, [editedContents, onRefresh, toast])

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Added Providers (additive only) ────────────────────────── */}
      {isAdditive && profileProviders.length > 0 && (() => {
        const hermesYaml = configFiles.find(f => f.label === 'config.yaml')?.content ?? ''
        const activeProvider = agentType === 'hermes' ? parseActiveProvider(hermesYaml) : null
        const isActive = (id: string) => activeProvider === id

        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Profile Providers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {profileProviders.map((pp) => {
                const icon = resolveIconKey(pp.name)
                const active = isActive(pp.id)
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
                    {active ? (
                      <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                        Active
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => handleApply(pp.id)} isLoading={applyingId === pp.id}>
                        Activate
                      </Button>
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
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <ProviderIcon icon={icon} name={p.name} size={18} showFallback />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    {p.website_url && (
                      <a href={p.website_url} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-blue-500 hover:underline dark:text-blue-400 truncate block">
                        {p.website_url.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </div>
                  <Button size="sm" isLoading={applyingId === p.id} onClick={() => handleApply(p.id)}>
                    {isAdditive ? 'Add' : 'Apply'}
                  </Button>
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
