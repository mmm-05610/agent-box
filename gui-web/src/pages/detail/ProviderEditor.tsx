/**
 * Provider Editor — cc-switch style (Profile side).
 * Uses shared ProviderFormFields + Library apply cards.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui'
import { fetchProviders, applyProviderToProfile } from '@/api/providers'
import { patchJsonFile } from '@/api/files'
import {
  ProviderFormFields,
  defaultFormValues,
  formValuesToEnv,
  type ProviderFormValues,
} from '@/components/provider/ProviderFormFields'
import type { AgentType, Provider } from '@/api'

export function ProviderEditor({
  path, content, onRefresh, agentType,
}: {
  path: string; content: string; onRefresh: () => void
  agentType: string
}) {
  const parsed = useMemo(() => {
    try { const d = JSON.parse(content); return { env: d.env ?? {}, model: d.model, effortLevel: d.effortLevel } }
    catch { return { env: {} as Record<string, string>, model: undefined as string | undefined, effortLevel: undefined as string | undefined } }
  }, [content])

  const [values, setValues] = useState<ProviderFormValues>(
    () => defaultFormValues(parsed.env, parsed.model, parsed.effortLevel),
  )
  const [saving, setSaving] = useState(false)
  const [libraryProviders, setLibraryProviders] = useState<Provider[]>([])
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (agentType !== 'claude') return
    fetchProviders(agentType as AgentType).then(setLibraryProviders).catch(() => {})
  }, [agentType])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const newEnv = formValuesToEnv(values)
      await patchJsonFile(path, 'env', newEnv)
      if (values.fallbackModel !== (parsed.model ?? '')) await patchJsonFile(path, 'model', values.fallbackModel)
      if (values.effortLevel !== (parsed.effortLevel ?? '')) await patchJsonFile(path, 'effortLevel', values.effortLevel)
      onRefresh()
    } finally { setSaving(false) }
  }, [path, values, parsed, onRefresh])

  const handleApplyFromLibrary = useCallback(async (providerId: string) => {
    setApplying(true)
    try {
      const parts = path.split('/profiles/')
      if (parts.length === 2) { await applyProviderToProfile(parts[1].split('/')[0], providerId); onRefresh() }
    } finally { setApplying(false) }
  }, [path, onRefresh])

  return (
    <div className="space-y-4">
      {libraryProviders.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Apply from Library</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {libraryProviders.map((p) => {
              const penv = p.settings?.env ?? {}
              return (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-md bg-muted">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{p.name}</span>
                      {p.category && <Badge variant="neutral" className="text-[10px] px-1.5 py-0">{p.category}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{penv.ANTHROPIC_BASE_URL ?? ''}</div>
                  </div>
                  <Button variant="ghost" size="sm" disabled={applying} onClick={() => handleApplyFromLibrary(p.id)}>Apply</Button>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Provider Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ProviderFormFields values={values} onChange={setValues} />
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save Provider Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
