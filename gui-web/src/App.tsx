/**
 * App — Root component with routing
 */

import { useState } from 'react'
import { Shell, type NavKey } from '@/components/layout'
import { ToastProvider } from '@/components/feedback'
import { HomePage, PlaceholderPage } from '@/pages'

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
      return <PlaceholderPage title="Profiles" icon="◻" />
    case 'library':
      return <PlaceholderPage title="Library" icon="◈" />
    case 'sessions':
      return <PlaceholderPage title="Sessions" icon="⟳" />
    case 'settings':
      return <PlaceholderPage title="Settings" icon="⚙" />
    case 'help':
      return <PlaceholderPage title="Help" icon="?" />
    default:
      return <HomePage />
  }
}

export default App
