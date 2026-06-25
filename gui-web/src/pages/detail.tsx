/**
 * Profile Detail Page — View and edit a single profile's configuration
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Badge } from '@/components/ui'
import { Loading, useToast } from '@/components/feedback'
import { cn } from '@/lib/utils'
import type { AgentType, Profile } from '@/api'
import { AGENT_TYPE_COLORS, fetchProfileDetail } from '@/api'

// ── Types ──────────────────────────────────────────────────────────────

interface ProfileDetail {
  path: string
  meta: {
    name: string
    agent_type: string
    display_name: string
    description: string
    provider: string
    claude_md: string
    preset: string
  }
  config_dir: string
}

interface ProfileDetailPageProps {
  profileName: string
  onBack: () => void
}

// ── Component ──────────────────────────────────────────────────────────

export function ProfileDetailPage({ profileName, onBack }: ProfileDetailPageProps) {
  const [detail, setDetail] = useState<ProfileDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchProfileDetail(profileName)
        if (data) {
          // The API returns a Profile, but we need the raw detail
          // For now, construct a basic detail from the profile
          setDetail({
            path: '',
            meta: {
              name: data.name,
              agent_type: data.agentType,
              display_name: data.displayName ?? '',
              description: data.description ?? '',
              provider: data.providerRef ?? '',
              claude_md: data.claudeMdRef ?? '',
              preset: '',
            },
            config_dir: '',
          })
        } else {
          setError('Profile not found')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [profileName])

  if (loading) {
    return (
      <div className="p-8">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          ← Back
        </Button>
        <Loading variant="skeleton" rows={4} />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="p-8">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          ← Back
        </Button>
        <div className="flex flex-col items-center gap-3 py-16 text-destructive">
          <p>{error ?? 'Profile not found'}</p>
          <Button variant="ghost" size="sm" onClick={onBack}>
            Go back
          </Button>
        </div>
      </div>
    )
  }

  const { meta } = detail
  const badgeVariant = AGENT_TYPE_COLORS[meta.agent_type as AgentType] ?? 'neutral'

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Back
        </Button>
        <h1 className="text-xl font-bold text-foreground">{meta.name}</h1>
        <Badge variant={badgeVariant as 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info'}>
          {meta.agent_type}
        </Badge>
      </div>

      {/* Meta info */}
      <Card className="mb-4">
        <Card.Header>
          <Card.Title>Profile Info</Card.Title>
        </Card.Header>
        <Card.Content>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-muted-foreground mb-1">Name</dt>
              <dd className="text-sm text-foreground font-mono">{meta.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground mb-1">Agent Type</dt>
              <dd className="text-sm text-foreground">{meta.agent_type}</dd>
            </div>
            {meta.display_name && (
              <div>
                <dt className="text-xs text-muted-foreground mb-1">Display Name</dt>
                <dd className="text-sm text-foreground">{meta.display_name}</dd>
              </div>
            )}
            {meta.description && (
              <div>
                <dt className="text-xs text-muted-foreground mb-1">Description</dt>
                <dd className="text-sm text-foreground">{meta.description}</dd>
              </div>
            )}
            {meta.provider && (
              <div>
                <dt className="text-xs text-muted-foreground mb-1">Provider</dt>
                <dd className="text-sm text-foreground font-mono">{meta.provider}</dd>
              </div>
            )}
            {meta.preset && (
              <div>
                <dt className="text-xs text-muted-foreground mb-1">Preset</dt>
                <dd className="text-sm text-foreground">{meta.preset}</dd>
              </div>
            )}
          </dl>
        </Card.Content>
      </Card>

      {/* Paths */}
      {detail.path && (
        <Card className="mb-4">
          <Card.Header>
            <Card.Title>Paths</Card.Title>
          </Card.Header>
          <Card.Content>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-muted-foreground mb-1">Profile Directory</dt>
                <dd className="text-sm text-foreground font-mono break-all">{detail.path}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground mb-1">Config Directory</dt>
                <dd className="text-sm text-foreground font-mono break-all">{detail.config_dir}</dd>
              </div>
            </dl>
          </Card.Content>
        </Card>
      )}

      {/* Claude.md */}
      {meta.claude_md && (
        <Card>
          <Card.Header>
            <Card.Title>Claude.md</Card.Title>
          </Card.Header>
          <Card.Content>
            <pre className="text-sm text-foreground font-mono whitespace-pre-wrap bg-muted p-4 rounded-md">
              {meta.claude_md}
            </pre>
          </Card.Content>
        </Card>
      )}
    </div>
  )
}
