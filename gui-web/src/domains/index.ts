import type { ComponentType } from 'react'

import { providerResource } from './provider'
import { mcpResource } from './mcp'
import { skillResource } from './skills'
import { hookResource } from './hooks'
import { promptResource } from './prompt'
import { permissionsResource } from './permissions'
import { pluginsResource } from './plugins'
import { rulesResource } from './rules'
import { memoriesResource } from './memories'
import { instructionsResource } from './instructions'

export interface ResourceDef {
  key: string
  labelKey: string          // i18n key (literal for now)
  List: ComponentType<any>      // list component (tab body)
  Editor?: ComponentType<any>   // edit component
}

export const RESOURCES = {
  provider: providerResource,
  mcp: mcpResource,
  skills: skillResource,
  hooks: hookResource,
  prompt: promptResource,
  permissions: permissionsResource,
  plugins: pluginsResource,
  rules: rulesResource,
  memories: memoriesResource,
  instructions: instructionsResource,
} satisfies Record<string, ResourceDef>

export type ResourceKey = keyof typeof RESOURCES
