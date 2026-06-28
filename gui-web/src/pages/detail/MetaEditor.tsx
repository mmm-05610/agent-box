/**
 * Meta Editor — form for display_name, description.
 * Read-only: name, agent_type, provider, preset, paths.
 */

import { useCallback, useState } from 'react'
import { Button, Card, CardHeader, CardTitle, CardContent, Input } from '@/components/ui'
import { Textarea } from '@/components/ui'
import { editProfile } from '@/api'
import type { ProfileDetail } from '../detail'

export function MetaEditor({ detail, onRefresh }: { detail: ProfileDetail; onRefresh: () => void }) {
  const [displayName, setDisplayName] = useState(detail.meta.display_name ?? '')
  const [description, setDescription] = useState(detail.meta.description ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await editProfile(detail.meta.name, { displayName, description })
      onRefresh()
    } finally {
      setSaving(false)
    }
  }, [detail, displayName, description, onRefresh])

  const { meta } = detail

  return (
    <Card>
      <CardHeader><CardTitle>Profile Metadata</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Name</label>
            <div className="text-sm font-mono text-foreground">{meta.name}</div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Agent Type</label>
            <div className="text-sm text-foreground">{meta.agent_type}</div>
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Display Name</label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Human-readable name"
            className="text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Description</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this profile is for..."
            rows={3}
            className="text-sm"
          />
        </div>

        {meta.provider && (
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Provider</label>
            <div className="text-sm font-mono text-foreground">{meta.provider}</div>
          </div>
        )}
        {meta.preset && (
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Preset</label>
            <div className="text-sm text-foreground">{meta.preset}</div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground font-mono">
          <div>Profile: {detail.path}</div>
          <div>Config: {detail.config_dir}</div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  )
}
