import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type CodeEditorApi } from '@/components/chat/code-editor'
import { JsonDocumentEditor } from '@/components/chat/json-document-editor'
import { LogTail } from '@/components/chat/log-tail'
import { PageLoader } from '@/components/page-loader'
import { AvatarChip } from '@/components/ui/avatar-chip'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { ErrorBanner } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { TextTab } from '@/components/ui/text-tab'
import { Textarea } from '@/components/ui/textarea'
import { Tip } from '@/components/ui/tooltip'
import {
  getActionStatus,
  getLogs,
  getMcpCatalog,
  type HermesGateway,
  installMcpCatalogEntry,
  type McpCatalogEntry,
  type McpTestResult,
  type ProfileScope,
  profileScopeKey,
  saveMcpServers,
  testMcpServer
} from '@/hermes'
import { useI18n } from '@/i18n'
import { startCompletionPoll } from '@/lib/completion-poll'
import { brandFor } from '@/lib/mcp-brands'
import { estimateServerTokens, serverUsageCount } from '@/lib/mcp-cost'
import { completeMcpDesktopOAuth } from '@/lib/mcp-dashboard-oauth'
import { type McpImportEntry, parseMcpImport } from '@/lib/mcp-import'
import { PROBE_TTL_MS, probeCache, probeKey, serverFingerprint } from '@/lib/mcp-probe-cache'
import { getServers, type McpServers } from '@/lib/mcp-servers'
import { isToolEnabled, toggleToolInServer } from '@/lib/mcp-tool-filter'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import { $activeGatewayProfile, normalizeProfileKey } from '@/store/profile'
import { $activeSessionId } from '@/store/session'
import { hermesConfigCacheWriter, useHermesConfigRecord } from '../hooks/use-config-record'
import { useOnProfileSwitch } from '../hooks/use-on-profile-switch'
import { DetailPane, ICON_BUTTON, MASTER_DETAIL_WIDE_COLS } from '../master-detail'
import { PanelAddButton, PanelEmpty } from '../overlays/panel'
import { prettyName } from '../settings/helpers'
import { useDeepLinkHighlight } from '../settings/use-deep-link-highlight'
import {
  capabilitySummary,
  loadMcpUsage,
  MCP_CATALOG_KEY,
  parseServersDoc,
  type Probe,
  scanServerBlocks,
  type ServerCost,
  serverEnabled,
  type ServerStatus,
  STATUS_DOT,
  statusLine,
  statusOf,
  wrapDoc,
} from './view-model'
import {
  ServerConfig,
  ServerSwitch,
  ServerIconActions,
  McpImportButton,
  CatalogTag,
  McpCatalog,
  LOG_POLL_MS,
  CATALOG_INSTALL_POLL_MS,
  STDIO_MARKER_RE,
  filterStdioSections,
  McpLogs,
  McpAvatar,
  McpRow,
} from './mcp-tab-parts'

export { McpTab } from './mcp-tab-view'
export const STARTER_ENTRY = { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'] }
