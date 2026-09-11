import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tip } from '@/components/ui/tooltip'
import type { DesktopAuthProvider, DesktopCloudAgent, DesktopCloudOrg, DesktopConnectionProbeResult } from '@/global'
import { useI18n } from '@/i18n'
import { ExternalLink } from '@/lib/external-link'
import {
  AlertCircle,
  Check,
  Cloud,
  FileText,
  Globe,
  HelpCircle,
  Loader2,
  LogIn,
  Monitor,
  RefreshCw,
  Terminal
} from '@/lib/icons'
import { coerceRemoteUrlScheme } from '@/lib/remote-url'
import { selectableCardClass } from '@/lib/selectable-card'
import { cn } from '@/lib/utils'
import {
  $activeConnectionId,
  $connectionsRegistry,
  refreshConnectionsRegistry,
  selectConnection
} from '@/store/connections'
import { notify, notifyError, readableError } from '@/store/notifications'
import { ConnectionsRegistrySection } from './connections-registry'
import { CONTROL_TEXT } from './constants'
import { ManagedUpdatesSection } from './managed-updates-section'
import { EmptyState, ListRow, Pill, SettingsContent, SettingsSkeleton, ToggleRow } from './primitives'
import {
  type AuthMode,
  type CloudDiscoverStatus,
  EMPTY_STATE,
  type GatewaySettingsState,
  normalizeGatewaySettingsState,
  type ProbeStatus,
  savedCloudConnectionUrl,
  SSH_HOST_CUSTOM
} from './settings-state'
import { enrichSelectedSshHost, selectSshHost } from './ssh-host-selection'

import {
  ModeCard,
} from './gateway-settings-parts'
export { GatewaySettings } from './gateway-settings-view'
export type { GatewaySettingsState } from './settings-state'
export { normalizeGatewaySettingsState, savedCloudConnectionUrl } from './settings-state'
