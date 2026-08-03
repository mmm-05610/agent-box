/**
 * App — Root component with routing
 */

import { useState } from 'react'
import { Shell, type NavKey } from '@/components/layout'
import { ErrorBoundary, ToastProvider } from '@/components/feedback'
import { useSessions } from '@/hooks'
import {
  HelpPage,
  HomePage,
  ProfileDetailPage,
  ProfilesPage,
  SessionsPage,
  SettingsPage,
} from '@/pages'

export default function App() {
  const [page, setPage] = useState<NavKey>('home')
  const [detailProfile, setDetailProfile] = useState<string | null>(null)
  const [autoOpenCreate, setAutoOpenCreate] = useState(false)
  // Live running count for the Sidebar status pill — not a hardcoded 0.
  const { running } = useSessions()

  // Navigate to a page and close any open detail
  const handleNav = (key: NavKey) => {
    setDetailProfile(null)
    setPage(key)
  }

  // Navigate to profiles and auto-open the create modal
  const handleNewProfile = () => {
    setDetailProfile(null)
    setPage('profiles')
    setAutoOpenCreate(true)
  }

  return (
    <ToastProvider>
      <Shell active={page} onNav={handleNav} onNewProfile={handleNewProfile} runningCount={running.length}>
        <ErrorBoundary name="App">
          <PageRouter
            page={page}
            detailProfile={detailProfile}
            autoOpenCreate={autoOpenCreate}
            onAutoOpenCreateHandled={() => setAutoOpenCreate(false)}
            onNav={handleNav}
            onOpenDetail={setDetailProfile}
            onCloseDetail={() => setDetailProfile(null)}
          />
        </ErrorBoundary>
      </Shell>
    </ToastProvider>
  )
}

function PageRouter({
  page,
  detailProfile,
  autoOpenCreate,
  onAutoOpenCreateHandled,
  onNav,
  onOpenDetail,
  onCloseDetail,
}: {
  page: NavKey
  detailProfile: string | null
  autoOpenCreate: boolean
  onAutoOpenCreateHandled: () => void
  onNav: (key: NavKey) => void
  onOpenDetail: (name: string) => void
  onCloseDetail: () => void
}) {
  if (detailProfile) {
    return <ProfileDetailPage profileName={detailProfile} onBack={onCloseDetail} />
  }

  switch (page) {
    case 'home':
      return <HomePage onNav={onNav} />
    case 'profiles':
      return <ProfilesPage onOpenDetail={onOpenDetail} autoOpenCreate={autoOpenCreate} onAutoOpenCreateHandled={onAutoOpenCreateHandled} />
    case 'sessions':
      return <SessionsPage />
    case 'settings':
      return <SettingsPage />
    case 'help':
      return <HelpPage />
    default:
      return <HomePage onNav={onNav} />
  }
}