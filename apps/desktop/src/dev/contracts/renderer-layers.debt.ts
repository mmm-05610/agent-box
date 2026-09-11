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
  // components/ — 28
  'components/assistant-ui/clarify-tool.tsx -> @/app/chat/composer/focus',
  'components/assistant-ui/directive-text.tsx -> @/app/open-session',
  'components/assistant-ui/inline-preview-directive.tsx -> @/app/chat/composer/focus',
  'components/assistant-ui/thread/assistant-message.tsx -> @/app/routes',
  'components/assistant-ui/thread/changed-files-card.tsx -> @/app/chat/composer/scope',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/composer/directive-actions',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/composer/drop-affordance',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/composer/focus',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/composer/hooks/use-at-completions',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/composer/hooks/use-composer-trigger',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/composer/hooks/use-composer-undo',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/composer/hooks/use-emoji-completions',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/composer/hooks/use-slash-completions',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/composer/inline-refs',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/composer/path-refs',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/composer/rich-editor',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/composer/text-utils',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/composer/trigger-popover',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/composer/undo-history',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/composer/url-refs',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/chat/hooks/use-composer-actions',
  'components/assistant-ui/thread/user-edit-composer.tsx -> @/app/session/hooks/use-prompt-actions',
  'components/boot-failure-overlay.tsx -> @/app/settings/gateway-settings',
  'components/find-bar.tsx -> @/app/routes',
  'components/pet/floating-pet.tsx -> @/app/gateway/hooks/use-gateway-request',
  'components/pet/floating-pet.tsx -> @/app/hooks/use-on-profile-switch',
  'components/pet/floating-pet.tsx -> @/app/hooks/use-route-overlay-active',
  'components/tips/use-tip-rotation.ts -> @/app/routes',

  // extension/ — 16
  'extension/sdk/host-session-options.ts -> @/app/open-session',
  'extension/sdk/host-session.ts -> @/app/open-session',
  'extension/sdk/index.ts -> @/app/chat/composer/contrib',
  'extension/sdk/index.ts -> @/app/chat/session-status-dot',
  'extension/sdk/index.ts -> @/app/chat/sidebar/chrome',
  'extension/sdk/index.ts -> @/app/chat/sidebar/connection-glyph',
  'extension/sdk/index.ts -> @/app/chat/sidebar/row-geometry',
  'extension/sdk/index.ts -> @/app/command-palette/contrib',
  'extension/sdk/index.ts -> @/app/overlays/panel',
  'extension/sdk/index.ts -> @/app/routes',
  'extension/sdk/index.ts -> @/app/settings/toolset-config-panel',
  'extension/sdk/index.ts -> @/app/shell/model-catalog-menu',
  'extension/sdk/index.ts -> @/app/shell/statusbar-controls',
  'extension/sdk/index.ts -> @/app/shell/titlebar-controls',
  'extension/sdk/index.ts -> @/app/skills',
  'extension/sdk/index.ts -> @/app/skills/mcp-tab',

  // lib/ — 25
  'lib/desktop-fs.ts -> @/store/session',
  'lib/external-link.tsx -> @/store/preview',
  'lib/guarded-model-switch.ts -> @/store/notifications',
  'lib/haptics.ts -> @/store/haptics',
  'lib/hooks/use-image-download.ts -> @/store/notifications',
  'lib/keybinds/composer-focus-keys.ts -> @/app/routes',
  'lib/keybinds/composer-focus-keys.ts -> @/components/pane-shell/tree/store',
  'lib/keybinds/composer-focus-keys.ts -> @/store/session-switcher',
  'lib/keybinds/use-keybind-hint.ts -> @/store/keybinds',
  'lib/media.ts -> @/store/session',
  'lib/oneshot.ts -> @/store/gateway',
  'lib/oneshot.ts -> @/store/session',
  'lib/session-export.ts -> @/store/notifications',
  'lib/session-link-title.ts -> @/store/session',
  'lib/session-project-label.ts -> @/app/chat/sidebar/projects/workspace-groups',
  'lib/slash-completion-cache.ts -> @/store/profile/identity',
  'lib/slash-completion-cache.ts -> @/store/profile/runtime-route-state',
  'lib/sound/completion-sound.ts -> @/store/ambient',
  'lib/sound/completion-sound.ts -> @/store/haptics',
  'lib/sound/completion-sound.ts -> @/store/sound/completion-sound',
  'lib/statusbar.tsx -> @/components/chat/stable-text',
  'lib/tour/run-tour.ts -> @/app/chat/right-rail/preview-tour',
  'lib/tour/run-tour.ts -> @/store/pane-focus',
  'lib/yolo-session.ts -> @/store/gateway',
  'lib/yolo-session.ts -> @/store/session',

  // store/ — 20
  'store/gateway-switch.ts -> @/app/contrib/hooks/use-background-sync',
  'store/layout.ts -> @/components/pane-shell/tree/store',
  'store/pane-focus.ts -> @/app/right-sidebar/store',
  'store/pane-focus.ts -> @/components/pane-shell/tree/presets',
  'store/pane-focus.ts -> @/components/pane-shell/tree/store',
  'store/profile-share.ts -> @/components/pane-shell/tree/store',
  'store/projects/crud.ts -> @/app/chat/new-session-drag',
  'store/projects/crud.ts -> @/app/chat/sidebar/projects/workspace-groups',
  'store/projects/dialogs.ts -> @/app/chat/new-session-drag',
  'store/projects/refresh.ts -> @/app/chat/sidebar/projects/workspace-groups',
  'store/projects/scope.ts -> @/app/chat/sidebar/projects/workspace-groups',
  'store/review.ts -> @/components/pane-shell/tree/store',
  'store/session-color.ts -> @/app/chat/sidebar/projects/workspace-groups',
  'store/session-focus.ts -> @/components/pane-shell/tree/store',
  'store/session-focus.ts -> @/components/pane-shell/workspace-scope',
  'store/session-states/tile-operations.ts -> @/components/pane-shell/tree/store',
  'store/session-states/tile-operations.ts -> @/components/pane-shell/workspace-scope',
  'store/suggestion-providers/cron.ts -> @/app/chat/composer/focus',
  'store/suggestion-providers/github.ts -> @/app/chat/composer/focus',
  'store/suggestion-providers/skill.ts -> @/app/chat/composer/focus',
]
