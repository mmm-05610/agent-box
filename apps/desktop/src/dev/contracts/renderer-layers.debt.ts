// The renderer's upward-import debt, frozen.
//
// GENERATED — do not hand-edit. Regenerate with `npm run ledger:layers` from
// `apps/desktop`. In a round that only fixes an edge you do not need to: delete
// the line `renderer-layers.test.ts` names. Regenerate whenever files move,
// because every entry is keyed by the importer's path and the specifier as
// written.
//
// Each entry is `<src-relative importer> -> <specifier as written>`. It records
// an import that points at a layer ranked ABOVE the one that wrote it. The list
// exists for one reason: to make the remaining work visible and to make a
// regression impossible to land quietly. It is not a list of things that are
// fine.
//
// Grouped by the layer that owns the offending import, because that is how the
// work gets scheduled: a `lib/` batch, a `store/` batch, and so on.

export const DEBT_LEDGER: readonly string[] = [
  // components/ — 5
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/session/hooks/use-prompt-actions',
  'components/boot-failure-overlay.tsx -> @/app/settings/gateway-settings',
  'components/pet/floating-pet.tsx -> @/app/gateway/hooks/use-gateway-request',
  'components/pet/floating-pet.tsx -> @/app/hooks/use-on-profile-switch',
  'components/pet/floating-pet.tsx -> @/app/hooks/use-route-overlay-active',

  // extension/ — 3
  'extension/sdk/index.ts -> @/app/settings/toolset-config-panel',
  'extension/sdk/index.ts -> @/app/skills',
  'extension/sdk/index.ts -> @/app/skills/mcp-tab',

  // lib/ — 11
  'lib/guarded-model-switch.ts -> @/store/notifications',
  'lib/keybinds/composer-focus-keys.ts -> @/app/routes',
  'lib/keybinds/composer-focus-keys.ts -> @/store/pane-shell/tree',
  'lib/keybinds/composer-focus-keys.ts -> @/store/session-switcher',
  'lib/keybinds/use-keybind-hint.ts -> @/store/keybinds',
  'lib/oneshot.ts -> @/store/gateway',
  'lib/oneshot.ts -> @/store/session',
  'lib/session-export.ts -> @/store/notifications',
  'lib/session-project-label.ts -> @/app/chat/sidebar/projects/workspace-groups',
  'lib/yolo-session.ts -> @/store/gateway',
  'lib/yolo-session.ts -> @/store/session',

  // store/ — 4
  'store/gateway-switch.ts -> @/app/contrib/hooks/use-background-sync',
  'store/pane-focus.ts -> @/app/right-sidebar/store',
  'store/projects/crud.ts -> @/app/chat/new-session-drag',
  'store/projects/dialogs.ts -> @/app/chat/new-session-drag',
]
