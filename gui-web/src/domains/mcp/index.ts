import type { ComponentType } from 'react'
import type { ResourceDef } from '..'

// TODO(stage 3): migrate the real list component from pages/detail/McpTab.
const PlaceholderList: ComponentType<any> = () => null

export const mcpResource: ResourceDef = {
  key: 'mcp',
  labelKey: 'resource.mcp',
  List: PlaceholderList,
}
