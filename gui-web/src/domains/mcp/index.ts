import type { ResourceDef } from '..'
import { McpList } from './List'

export const mcpResource: ResourceDef = {
  key: 'mcp',
  labelKey: 'resource.mcp',
  List: McpList,
}
