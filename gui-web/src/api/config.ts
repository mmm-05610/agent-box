/**
 * Config-file registry API — user-editable config files (gui-settings.json, …)
 * exposed through the backend config_files resource.  The GUI settings page and
 * the future CLI `config` command share this one surface.
 */
import { call } from '@/lib/bridge'

export type ConfigFormat = 'json' | 'jsonc' | 'toml' | 'yaml' | 'yml' | 'text'

export interface ConfigFileMeta {
  key: string
  path: string
  format: ConfigFormat
  description: string
  exists: boolean
  size: number
}

export interface ConfigFileContent extends ConfigFileMeta {
  content: string
}

/** Registry of config files — metadata only (no content). */
export async function listConfigFiles(): Promise<ConfigFileMeta[]> {
  return call<ConfigFileMeta[]>((api) => api.list_config_files!(), [])
}

/** Read one config file's raw content + metadata for the editor. */
export async function getConfigFile(key: string): Promise<ConfigFileContent> {
  return call<ConfigFileContent>((api) => api.get_config_file!(key), {
    key,
    path: '',
    format: 'json',
    description: '',
    exists: false,
    size: 0,
    content: '',
  })
}

/** Validate + atomically write a config file. Throws on invalid content. */
export async function saveConfigFile(key: string, content: string): Promise<void> {
  await call<void>((api) => api.save_config_file!(key, content), undefined)
}
