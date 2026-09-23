import { Token, type ResourceScope, type IDisposable } from '@ordessa/extension-api'
import type { ComponentType } from 'react'
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
