import { Token, type ResourceScope, type IDisposable } from '@ordessa/extension-api'
import type { ComponentType } from 'react'
export interface Observable<T> { getSnapshot(): readonly T[]; subscribe(listener: () => void): () => void }
export interface Command { id: string; title: string; execute(): unknown | Promise<unknown> }
export type CommandResult = { ok: true; value: unknown } | { ok: false; error: string }
export interface Commands extends Observable<Pick<Command, 'id' | 'title'>> {
  forScope(scope: ResourceScope): { add(command: Command): IDisposable }
  execute(id: string): Promise<CommandResult>
}
export const CommandsToken = new Token<Commands>('ordessa.commands.v1')
export type Region = 'left' | 'right' | 'bottom' | 'main' | 'top'
interface ViewBase { id: string; title: string; order?: number; component: ComponentType }
export type View = ViewBase & ({ presentation: 'region'; region: Region } | { presentation: 'full-page' })
export type UIContribution = { id: string; order?: number } & (
  { kind: 'command'; slot: 'navigation' | 'toolbar' | 'statusbar'; command: string; label?: string; section?: 'primary' | 'utility'; icon?: ComponentType } |
  { kind: 'component'; slot: 'statusbar'; component: ComponentType }
)
export interface Workbench {
  forScope(scope: ResourceScope): { addView(view: View): IDisposable; addUI(item: UIContribution): IDisposable }
  open(id: string): void
  close(id: string): void
}
export const WorkbenchToken = new Token<Workbench>('ordessa.workbench.v1')
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
