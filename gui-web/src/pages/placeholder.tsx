/**
 * Placeholder Page — Temporary placeholder for unimplemented pages
 */

import { EmptyState } from '@/components/feedback'

interface PlaceholderPageProps {
  title: string
  icon?: string
}

export function PlaceholderPage({ title, icon = '⚠' }: PlaceholderPageProps) {
  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-bold text-foreground">{title}</h1>
      <EmptyState
        icon={icon}
        title={`${title} page`}
        description="This page is under construction."
      />
    </div>
  )
}
