/**
 * App — Root component with routing
 */

import { useState } from 'react'
import { Shell, type NavKey } from '@/components/layout'
import { ToastProvider } from '@/components/feedback'
import {
  HelpPage,
  HomePage,
  LibraryPage,
  PlaceholderPage,
  ProfileDetailPage,
  ProfilesPage,
  SessionsPage,
  SettingsPage,
} from '@/pages'

function App() {
  const [page, setPage] = useState<NavKey>('home')
  const [detailProfile, setDetailProfile] = useState<string | null>(null)

  return (
    <ToastProvider>
      <Shell active={page} onNav={setPage} runningCount={0}>
        <PageRouter
          page={page}
          detailProfile={detailProfile}
          onNav={setPage}
          onOpenDetail={setDetailProfile}
          onCloseDetail={() => setDetailProfile(null)}
        />
      </Shell>
    </ToastProvider>
  )
}

function PageRouter({
  page,
  detailProfile,
  onNav,
  onOpenDetail,
  onCloseDetail,
}: {
  page: NavKey
  detailProfile: string | null
  onNav: (key: NavKey) => void
  onOpenDetail: (name: string) => void
  onCloseDetail: () => void
}) {
  // If a detail profile is open, show detail page
  if (detailProfile) {
    return <ProfileDetailPage profileName={detailProfile} onBack={onCloseDetail} />
  }

  switch (page) {
    case 'home':
      return <HomePage onNav={onNav} />
    case 'profiles':
      return <ProfilesPage onOpenDetail={onOpenDetail} />
    case 'library':
      return <LibraryPage />
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

export default App
