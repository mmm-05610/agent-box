import type { ResourceDef } from '..'
import { McpList } from './McpList'

export const mcpResource: ResourceDef = {
  key: 'mcp',
  labelKey: 'resource.mcp',
  List: McpList,
}
