/**
 * Tabs — horizontal tab strip with sliding underline indicator.
 *
 * Uses CSS grid with one shared `<span>` indicator positioned via
 * `style={{ gridColumn: activeIndex + 1 }}`. The indicator's position
 * is animated via CSS transition, giving the "slides between tabs" feel.
 *
 * Each tab is rendered as a real `<button>` with `role="tab"` and
 * `aria-selected`. Use as a controlled component.
 *
 * @example
 *   <Tabs
 *     tabs={[
 *       { key: 'all', label: 'All', count: 12 },
 *       { key: 'cc',  label: 'Claude', count: 5 },
 *     ]}
 *     active={activeTab}
 *     onChange={setActiveTab}
 *   />
 */

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

export interface TabItem<TKey extends string = string> {
  key: TKey
  label: ReactNode
  count?: number
  disabled?: boolean
}

interface TabsProps<TKey extends string> {
  tabs: TabItem<TKey>[]
  active: TKey
  onChange: (key: TKey) => void
  className?: string
  /** Use a tighter variant for inside cards / segmented controls. */
  size?: 'md' | 'sm'
  /** Hide the count badge. */
  hideCount?: boolean
}

// ── Component ──────────────────────────────────────────────────────────

export function Tabs<TKey extends string = string>({
  tabs,
  active,
  onChange,
  className,
  size = 'md',
  hideCount = false,
}: TabsProps<TKey>) {
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === active),
  )

  return (
    <div
      role="tablist"
      className={cn(
        'relative grid',
        className,
      )}
      style={{
        gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
      }}
    >
{tabs.map((tab) => {
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.key}`}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.key)}
            className={cn(
              'group relative flex items-center justify-center gap-1.5 cursor-pointer rounded-md',
              'transition-[color,background-color,transform] duration-normal',
              'focus-visible:outline-none',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              size === 'md' ? 'py-1.5 px-1 text-sm' : 'py-1 px-0.5 text-xs',
              // Hover (inactive only): subtle bg + text darken
              !isActive &&
                'text-muted-foreground hover:bg-muted/60 hover:text-foreground motion-safe:hover:scale-[1.02]',
              // Active state: clear contrast + tiny lift
              isActive && 'text-foreground font-semibold scale-[1.02]',
            )}
          >
            <span className="truncate">{tab.label}</span>
            {!hideCount && tab.count != null && (
              <span
                className={cn(
                  'shrink-0 tabular-nums',
                  isActive ? 'text-foreground' : 'text-muted-foreground/70',
                )}
              >
                ({tab.count})
              </span>
            )}
          </button>
        )
      })}

      {/* Sliding underline indicator — accent color, thicker */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-accent',
          'transition-transform duration-200 ease-out shadow-[0_0_8px_hsl(var(--accent)/0.4)]',
        )}
        style={{
          width: `${100 / tabs.length}%`,
          transform: `translateX(${tabs.length === 1 ? 0 : activeIndex * 100}%)`,
        }}
      />
    </div>
  )
}