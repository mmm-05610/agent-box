import type * as React from 'react'

import { cn } from '@/lib/utils'

import { SIDEBAR_ROW_LEAD } from './row-geometry'

/** Fixed leading column (dot, icon, drag handle). */
export function SidebarRowLead({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn(SIDEBAR_ROW_LEAD, className)} {...props} />
}
