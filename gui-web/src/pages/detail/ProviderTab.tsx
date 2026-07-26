/**
 * Provider Tab — Apply from Library + Config file viewer.
 *
 * Replaces the per-agent provider editor/viewer components with a unified
 * layout:
 *   1. Apply from Library — ACS provider list with Apply button
 *   2. Raw config file editor — textarea per config file
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { fetchProviders, applyProviderToProfile } from '@/api/providers'
import { saveFile } from '@/api/files'
import { ProviderIcon } from '@/components/ProviderIcon'
import { hasIcon } from '@/icons/extracted'
import type { AgentType, Provider } from '@/api'

// ── Icon helpers ──────────────────────────────────────────────────────────

const PROVIDER_ICON_ALIASES: Record<string, string> = {
  'claude official': 'claude',
  'openai official': 'openai',
  'xiaomi mimo': 'xiaomimimo',
  'zhipu glm': 'zhipu',
  'anthropic claude': 'claude',
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

// ── Config file descriptor ─────────────────────────────────────────────────

export interface ConfigFile {
  label: string
  path: string
  content: string
}

// ── Component props ────────────────────────────────────────────────────────

interface ProviderTabProps {
  agentType: AgentType
  profileName: string
  configFiles: ConfigFile[]
  onRefresh: () => void
}

// ── Component ─────────────────────────────────────────────────────────────

export function ProviderTab({ agentType, profileName, configFiles, onRefresh }: ProviderTabProps) {
  const [libraryProviders, setLibraryProviders] = useState<Provider[]>([])
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [editedContents, setEditedContents] = useState<Record<string, string>>({})
  const [savingFile, setSavingFile] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchProviders(agentType)
      .then(setLibraryProviders)
      .catch(() => setLibraryProviders([]))
  }, [agentType])

  // Reset edited contents when configFiles change
  useEffect(() => {
    const init: Record<string, string> = {}
    for (const f of configFiles) init[f.path] = f.content
    setEditedContents(init)
  }, [configFiles.length > 0 ? configFiles[0].content : ''])

  const getEdited = (path: string) => editedContents[path] ?? configFiles.find(f => f.path === path)?.content ?? ''

  const handleApply = useCallback(async (providerId: string) => {
    setApplyingId(providerId)
    try {
      await applyProviderToProfile(profileName, providerId)
      onRefresh()
      const provider = libraryProviders.find(p => p.id === providerId)
      toast({ type: 'success', message: `${provider?.name ?? providerId} applied to ${profileName}` })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to apply provider' })
    } finally {
      setApplyingId(null)
    }
  }, [profileName, libraryProviders, onRefresh, toast])

  const handleSaveFile = useCallback(async (path: string) => {
    setSavingFile(path)
    try {
      const content = editedContents[path] ?? ''
      const ok = await saveFile(path, content)
      if (!ok) throw new Error('Save returned false')
      toast({ type: 'success', message: 'File saved' })
      onRefresh()
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save file' })
    } finally {
      setSavingFile(null)
    }
  }, [editedContents, onRefresh, toast])

  return (
    <div className="space-y-6">
      {/* ── Apply from Library ──────────────────────────────────────── */}
      {libraryProviders.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Apply from Library</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {libraryProviders.map((p) => {
              const icon = resolveIconKey(p.name)
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5"
                >
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
                  <Button
                    size="sm"
                    isLoading={applyingId === p.id}
                    onClick={() => handleApply(p.id)}
                  >
                    Apply
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
              <Button
                size="sm"
                variant="ghost"
                isLoading={savingFile === file.path}
                onClick={() => handleSaveFile(file.path)}
              >
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
