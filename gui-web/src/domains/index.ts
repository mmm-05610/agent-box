import type { ComponentType } from 'react'

import { providerResource } from './provider'
import { mcpResource } from './mcp'
import { skillResource } from './skills'
import { hookResource } from './hooks'
import { promptResource } from './prompt'

export interface ResourceDef {
  key: string
  labelKey: string          // i18n key (literal for now)
  List: ComponentType<any>      // list component (tab body)
  Editor?: ComponentType<any>   // edit component
}

export const RESOURCES = {
  provider: providerResource,
  mcp: mcpResource,
  skill: skillResource,
  hook: hookResource,
  prompt: promptResource,
} satisfies Record<string, ResourceDef>

export type ResourceKey = keyof typeof RESOURCES
