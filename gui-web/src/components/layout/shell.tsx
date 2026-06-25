/**
 * Shell — Main application layout
 *
 * Provides the sidebar + content area structure.
 * All pages are rendered inside the Shell.
 *
 * @example
 *   <Shell active="library" onNav={setPage}>
 *     <LibraryPage />
 *   </Shell>
 */

import { type ReactNode } from 'react'
import { Sidebar, type NavKey } from './sidebar'

// ── Types ──────────────────────────────────────────────────────────────

interface ShellProps {
  active: NavKey
  onNav: (key: NavKey) => void
  runningCount?: number
  children: ReactNode
}

// ── Component ──────────────────────────────────────────────────────────

export function Shell({ active, onNav, runningCount, children }: ShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar active={active} onNav={onNav} runningCount={runningCount} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
