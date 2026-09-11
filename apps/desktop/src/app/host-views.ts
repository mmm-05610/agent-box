import { ToolsetConfigPanel } from '@/app/settings/toolset-config-panel'
import { SkillsView } from '@/app/skills'
import { McpTab } from '@/app/skills/mcp-tab'
import { setPluginHostViews } from '@/extension/contrib/plugin'

/**
 * The host side of `ctx.hostViews` (batch 12): the real app surfaces a plugin
 * may render, registered at module scope — importing this module installs
 * them, and the app controller does that before plugin discovery.
 */
setPluginHostViews({ McpTab, SkillsView, ToolsetConfigPanel })
