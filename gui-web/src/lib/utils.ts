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
 * Format a timestamp to a human-readable relative time.
 *
 * @example
 *   formatRelativeTime(Date.now() - 60000) // → "1m ago"
 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

/**
 * Extract the first letter of a string, uppercased.
 */
export function getInitial(name: string): string {
  return (name[0] ?? '?').toUpperCase()
}

/**
 * Truncate a string to a maximum length.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 1) + '…'
}
