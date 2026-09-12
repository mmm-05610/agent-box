import { Codicon } from '@/components/ui/codicon'
import { DropdownMenuItem, DropdownMenuShortcut } from '@/components/ui/dropdown-menu'
import { formatCombo } from '@/lib/keybinds/combo'

// Accelerators shown beside the edit verbs. Display only — Chromium's
// before-input-event handling already executes the chords; the menu just
// advertises them the way the native menu did. `formatCombo` renders
// mod as ⌘ on macOS and Ctrl elsewhere.
export const EDIT_SHORTCUTS = {
  copy: formatCombo('mod+c'),
  cut: formatCombo('mod+x'),
  paste: formatCombo('mod+v'),
  selectAll: formatCombo('mod+a')
} as const

/** An item: codicon + label, or label + faded right-aligned shortcut. Edit
 *  verbs (cut/copy/paste/select all) drop the icon and show the accelerator
 *  instead, like the native menus they replaced. */
export function Item({
  disabled,
  icon,
  label,
  onSelect,
  shortcut
}: {
  disabled?: boolean
  icon?: string
  label: string
  onSelect: () => void
  shortcut?: string
}) {
  return (
    <DropdownMenuItem disabled={disabled} onSelect={onSelect}>
      {icon ? <Codicon name={icon} size="0.875rem" /> : null}
      <span>{label}</span>
      {shortcut ? <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut> : null}
    </DropdownMenuItem>
  )
}
