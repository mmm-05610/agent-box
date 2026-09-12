import { composerFill, composerSurfaceGlass } from '@/components/chat/composer-dock'
import { cn } from '@/lib/utils'

export { ChatBar } from './chat-bar'

export function ChatBarFallback() {
  return (
    <div
      className={cn(
        'group/composer absolute bottom-0 left-1/2 z-30 w-[min(var(--composer-width),calc(100%-2rem))] max-w-full -translate-x-1/2 rounded-2xl pt-2 pb-[var(--composer-shell-pad-block-end)]',
        'bg-linear-to-b from-transparent to-background/55'
      )}
      data-slot="composer-root"
    >
      <div className="composer-fallback-surface relative isolate h-(--composer-fallback-height) w-full rounded-[inherit] border border-[color-mix(in_srgb,var(--dt-composer-ring)_calc(18%*var(--composer-ring-strength)),var(--dt-input))]">
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 -z-10 rounded-[inherit]',
            composerFill,
            composerSurfaceGlass
          )}
        />
      </div>
    </div>
  )
}
