import { Token, type ResourceScope, type IDisposable } from '@ordessa/extension-api'
import type { ComponentType } from 'react'
export interface SettingGroup { id: string; title: string; description?: string; order?: number }
export type SettingValue = string | number | boolean
export interface Binding {
  read(): SettingValue | Promise<SettingValue>
  write?(value: SettingValue): void | Promise<void>
  subscribe?(notify: () => void): () => void
  validate?(value: SettingValue): string | undefined
}
interface SettingBase { id: string; group: string; title: string; description?: string; order?: number }
export type Setting = SettingBase & (
  { kind: 'custom'; component: ComponentType } |
  ({ binding: Binding } & ({ kind: 'boolean' | 'text' | 'number' } | { kind: 'enum'; options: readonly { value: string; label: string }[] }))
)
export interface Settings {
  forScope(scope: ResourceScope): { addGroup(group: SettingGroup): IDisposable; addItem(item: Setting): IDisposable }
}
export const SettingsToken = new Token<Settings>('ordessa.settings.v1')
