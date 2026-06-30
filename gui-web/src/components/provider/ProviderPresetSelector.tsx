/**
 * Provider Preset Selector — cc-switch style grid.
 *
 * Shows a grid of preset buttons with category grouping, search, and sort.
 * Used in the "Add Provider" flow in the Library page.
 */

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui'
import { ProviderIcon } from '@/components/ProviderIcon'
import { hasIcon } from '@/icons/extracted'
import type { ProviderPreset } from '@/api'

// ── Category helpers ─────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  official: 'Official',
  cn_official: 'CN Official',
  aggregator: 'Aggregator',
  third_party: 'Third Party',
  cloud_provider: 'Cloud',
}

const CATEGORY_ORDER: Record<string, number> = {
  official: 0,
  cn_official: 1,
  aggregator: 2,
  third_party: 3,
  cloud_provider: 4,
}

const CATEGORY_HINTS: Record<string, string> = {
  official: '💡 Official provider — uses browser login, no API key needed',
  cn_official: '💡 CN official provider — just fill in your API key',
  aggregator: '💡 Aggregator — fill in API key and endpoint',
  third_party: '💡 Third-party provider — needs API key and endpoint',
  cloud_provider: '💡 Cloud provider — platform-specific auth',
}

// ── Component ─────────────────────────────────────────────────────────────

export function ProviderPresetSelector({
  presets,
  selectedId,
  onSelect,
}: {
  presets: ProviderPreset[]
  selectedId: string | null
  onSelect: (id: string, preset: ProviderPreset | null) => void
}) {
  const [search, setSearch] = useState('')
  const [sortAlpha, setSortAlpha] = useState(false)

  const filtered = useMemo(() => {
    let items = [...presets]
    const q = search.trim().toLowerCase()
    if (q) {
      items = items.filter((p) =>
        (p.name + ' ' + p.id + ' ' + (p.cat ?? '')).toLowerCase().includes(q),
      )
    }
    if (sortAlpha) {
      items.sort((a, b) => a.name.localeCompare(b.name))
    } else {
      // Original order: official > cn_official > aggregator > third_party > cloud_provider
      items.sort(
        (a, b) =>
          (CATEGORY_ORDER[a.cat] ?? 99) - (CATEGORY_ORDER[b.cat] ?? 99),
      )
    }
    return items
  }, [presets, search, sortAlpha])

  const selectedPreset = presets.find((p) => p.id === selectedId) ?? null

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-foreground">
          Choose a preset
        </label>
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search presets..."
            className="h-7 w-44 text-xs"
          />
          <button
            type="button"
            onClick={() => setSortAlpha(!sortAlpha)}
            title={sortAlpha ? 'Restore original order' : 'Sort A–Z'}
            className={`
              flex h-7 w-7 items-center justify-center rounded-md text-xs
              transition-colors cursor-pointer
              ${sortAlpha ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/80'}
            `}
          >
            A↓
          </button>
        </div>
      </div>

      {/* Preset grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
        {/* Custom entry */}
        <button
          type="button"
          onClick={() => onSelect('custom', null)}
          className={`
            inline-flex items-center justify-start gap-2 px-3 py-2 rounded-lg
            text-sm font-medium transition-colors w-full cursor-pointer
            ${selectedId === 'custom'
              ? 'bg-blue-500 text-white'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'}
          `}
        >
          <span className="inline-block w-4 h-4 flex-shrink-0" />
          <span className="truncate">Custom</span>
        </button>

        {filtered.length === 0 && (
          <div className="col-span-full rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No matching presets.
          </div>
        )}

        {filtered.map((preset) => {
          const isSelected = selectedId === preset.id
          const iconKey =
            preset.id.toLowerCase().replace(/[^a-z0-9]/g, '')
          const hasCustomIcon = hasIcon(iconKey) || hasIcon(preset.name.toLowerCase())

          let bgClass = 'bg-muted text-muted-foreground hover:bg-muted/80'
          if (isSelected) {
            bgClass = 'bg-blue-500 text-white'
          }

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(preset.id, preset)}
              title={CATEGORY_LABELS[preset.cat] ?? preset.cat}
              className={`
                inline-flex items-center justify-start gap-2 px-3 py-2 rounded-lg
                text-sm font-medium transition-colors w-full cursor-pointer relative
                ${bgClass}
              `}
            >
              {hasCustomIcon ? (
                <ProviderIcon
                  icon={iconKey || preset.name.toLowerCase()}
                  name={preset.name}
                  size={14}
                  showFallback
                />
              ) : (
                <span className="inline-block w-3.5 h-3.5 flex-shrink-0" />
              )}
              <span className="truncate">{preset.name}</span>
            </button>
          )
        })}
      </div>

      {/* Category hint */}
      {selectedId && selectedId !== 'custom' && selectedPreset && (
        <p className="text-xs text-muted-foreground">
          {CATEGORY_HINTS[selectedPreset.cat] ?? '💡 Select a preset to pre-fill the form below.'}
        </p>
      )}
      {(!selectedId || selectedId === 'custom') && (
        <p className="text-xs text-muted-foreground">
          💡 Select a preset to pre-fill the form, or choose Custom to start from scratch.
        </p>
      )}
    </div>
  )
}
