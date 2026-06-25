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
  ProfilesPage,
  SessionsPage,
  SettingsPage,
} from '@/pages'

function App() {
  const [page, setPage] = useState<NavKey>('home')

  return (
    <ToastProvider>
      <Shell active={page} onNav={setPage} runningCount={0}>
        <PageRouter page={page} />
      </Shell>
    </ToastProvider>
  )
}

function PageRouter({ page }: { page: NavKey }) {
  switch (page) {
    case 'home':
      return <HomePage />
    case 'profiles':
      return <ProfilesPage />
    case 'library':
      return <LibraryPage />
    case 'sessions':
      return <SessionsPage />
    case 'settings':
      return <SettingsPage />
    case 'help':
      return <HelpPage />
    default:
      return <HomePage />
  }
}

export default App
