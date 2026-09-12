import { setPluginHostViews } from '@/extension/contrib/plugin'
import { ToolsetConfigPanel } from '@/features/settings/toolset-config-panel'
import { SkillsView } from '@/features/skills'
import { McpTab } from '@/features/skills/mcp-tab'

/**
 * The host side of `ctx.hostViews` (batch 12): the real app surfaces a plugin
 * may render, registered at module scope — importing this module installs
 * them, and the app controller does that before plugin discovery.
 */
setPluginHostViews({ McpTab, SkillsView, ToolsetConfigPanel })
