/**
 * Utility functions — shared across all components
 */

/**
 * Merge CSS class names, filtering out falsy values.
 * Replaces `clsx` + `tailwind-merge` for simplicity.
 *
 * @example
 *   cn('base', condition && 'active', className)
 *   cn('bg-red-500', 'bg-blue-500') // → 'bg-blue-500' (last wins)
 */
export function cn(...inputs: (string | false | null | undefined)[]): string {
  return inputs.filter(Boolean).join(' ')
}

/**
 * Format a timestamp to a human-readable relative time (i18n'd via `t`).
 *
 * @example
 *   formatRelativeTime(Date.now() - 60000, t) // → "1m ago" / "1 分钟前"
 */
export function formatRelativeTime(
  timestamp: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return t('time.daysAgo', { count: days })
  if (hours > 0) return t('time.hoursAgo', { count: hours })
  if (minutes > 0) return t('time.minutesAgo', { count: minutes })
  return t('time.justNow')
}
