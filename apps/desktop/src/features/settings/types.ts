import type { Dispatch, SetStateAction } from 'react'

import type { HermesGateway } from '@/api/client'
import type { IconComponent } from '@/lib/icons'
import type { EnvVarInfo } from '@/types/hermes'

export type SettingsView =
  | 'about'
  | 'appearance'
  | 'billing'
  | 'connections'
  | 'gateway'
  | 'keybinds'
  | 'keys'
  | 'mcp'
  | 'notifications'
  | 'plugins'
  | 'providers'
  | 'sessions'
  | `product:${'data' | 'harnesses' | 'hooks' | 'identities' | 'models' | 'resources'}`
  | `config:${string}`
export type EnvPatch = Partial<Pick<EnvVarInfo, 'is_set' | 'redacted_value'>>

/** Which runtime owns this Settings mount: the AgentBox product shell or the
 *  legacy Hermes shell. Same vocabulary as GatewayConnectingOverlay /
 *  CommandCenterView / `useDesktopIntegrations` — an explicit input, never
 *  inferred from gateway state, cache contents or errors. */
export type SettingsAuthority = 'agentbox' | 'hermes'

export interface SettingsPageProps {
  /**
   * The decision the pages inside branch on. Required, like every other
   * authority input in the shell: a caller has to state which runtime it mounts
   * for, so no page can drift into the legacy config path by omission.
   */
  authority: SettingsAuthority
  gateway?: HermesGateway | null
  onClose: () => void
  onConfigSaved?: () => void
  onMainModelChanged?: (provider: string, model: string) => void
}

export interface ProviderGroup {
  name: string
  priority: number
  entries: [string, EnvVarInfo][]
  hasAnySet: boolean
}

export interface DesktopConfigSection {
  id: string
  label: string
  icon: IconComponent
  keys: string[]
}

export interface EnvRowProps {
  varKey: string
  info: EnvVarInfo
  edits: Record<string, string>
  revealed: Record<string, string>
  saving: string | null
  setEdits: Dispatch<SetStateAction<Record<string, string>>>
  onSave: (key: string) => void
  onClear: (key: string) => void
  onReveal: (key: string) => void
  compact?: boolean
}
