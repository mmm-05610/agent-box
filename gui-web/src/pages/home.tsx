/**
 * Home Page — Dashboard with stats and quick actions
 */

import { useEffect, useState } from 'react'
import { Button, Card } from '@/components/ui'
import { Loading } from '@/components/feedback'
import { fetchProfiles } from '@/api/profiles'
import { fetchProviders } from '@/api/providers'
import { fetchSessions } from '@/api/sessions'
import type { NavKey } from '@/components/layout'

interface HomePageProps {
  onNav: (key: NavKey) => void
}

export function HomePage({ onNav }: HomePageProps) {
  const [profileCount, setProfileCount] = useState(0)
  const [providerCount, setProviderCount] = useState(0)
  const [sessionCount, setSessionCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [profiles, providers, sessions] = await Promise.all([
          fetchProfiles(),
          fetchProviders('claude'),
          fetchSessions(),
        ])
        setProfileCount(profiles.length)
        setProviderCount(providers.length)
        setSessionCount(sessions.filter((s) => !s.exitedAt).length)
      } catch (e) {
        console.error('Failed to load dashboard data:', e)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  if (loading) {
    return <Loading className="py-16" />
  }

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-bold text-foreground">Home</h1>

      <div className="grid grid-cols-3 gap-4">
        <Card hoverable onClick={() => onNav('profiles')}>
          <Card.Header>
            <Card.Title>Profiles</Card.Title>
            <Card.Description>Manage agent configurations</Card.Description>
          </Card.Header>
          <Card.Content>
            <p className="text-2xl font-bold text-foreground">{profileCount}</p>
          </Card.Content>
          <Card.Footer>
            <Button variant="ghost" size="sm">View all →</Button>
          </Card.Footer>
        </Card>

        <Card hoverable onClick={() => onNav('library')}>
          <Card.Header>
            <Card.Title>Library</Card.Title>
            <Card.Description>Providers & templates</Card.Description>
          </Card.Header>
          <Card.Content>
            <p className="text-2xl font-bold text-foreground">{providerCount}</p>
          </Card.Content>
          <Card.Footer>
            <Button variant="ghost" size="sm">View all →</Button>
          </Card.Footer>
        </Card>

        <Card hoverable onClick={() => onNav('sessions')}>
          <Card.Header>
            <Card.Title>Sessions</Card.Title>
            <Card.Description>Active agent sessions</Card.Description>
          </Card.Header>
          <Card.Content>
            <p className="text-2xl font-bold text-foreground">{sessionCount}</p>
          </Card.Content>
          <Card.Footer>
            <Button variant="ghost" size="sm">View all →</Button>
          </Card.Footer>
        </Card>
      </div>
    </div>
  )
}
