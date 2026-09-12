export type Mode = 'local' | 'remote' | 'cloud' | 'ssh'
export type AuthMode = 'oauth' | 'token'
export type ProbeStatus = 'idle' | 'probing' | 'done' | 'error'
export type CloudDiscoverStatus = 'idle' | 'loading' | 'done' | 'error'

/** Gateway settings form state and its normalizer. */

export interface GatewaySettingsState {
  envOverride: boolean
  mode: Mode
  remoteAuthMode: AuthMode
  remoteOauthConnected: boolean
  remoteTokenPreview: string | null
  remoteTokenSet: boolean
  // Whether OS-keychain-backed encryption (Electron safeStorage) is available.
  // Default true so we never gate on a value we haven't hydrated yet.
  secureTokenStorage: boolean
  // Whether the currently-persisted remote token is stored as plain text on
  // disk (opted-in on a machine without secure storage). Drives the warning banner.
  remoteTokenPlainText: boolean
  remoteUrl: string
  cloudOrg: string
  sshHost: string
  sshUser: string
  sshPort: number | null
  sshKeyPath: string
  sshRemoteHermesPath: string
  sshRemoteProfile: string
}

export const SSH_HOST_CUSTOM = '__custom__'

export const EMPTY_STATE: GatewaySettingsState = {
  envOverride: false,
  mode: 'local',
  remoteAuthMode: 'token',
  remoteOauthConnected: false,
  remoteTokenPreview: null,
  remoteTokenSet: false,
  secureTokenStorage: true,
  remoteTokenPlainText: false,
  remoteUrl: '',
  cloudOrg: '',
  sshHost: '',
  sshUser: '',
  sshPort: null,
  sshKeyPath: '',
  sshRemoteHermesPath: '',
  sshRemoteProfile: ''
}

export function normalizeGatewaySettingsState(
  config: Partial<GatewaySettingsState> | null | undefined
): GatewaySettingsState {
  if (!config || typeof config !== 'object') {
    return { ...EMPTY_STATE }
  }

  const defined = Object.fromEntries(Object.entries(config).filter(([, value]) => value != null))

  return { ...EMPTY_STATE, ...defined }
}

export function savedCloudConnectionUrl(config: Pick<GatewaySettingsState, 'mode' | 'remoteUrl'>): string {
  return config.mode === 'cloud' ? config.remoteUrl.trim().replace(/\/+$/, '').toLowerCase() : ''
}
