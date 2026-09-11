import {
  getUsageAnalytics,
  type McpTestResult,
  type ProfileScope
} from '@/hermes'
import { type Translations } from '@/i18n'
import { compactNumber } from '@/lib/format'
import { NEEDS_AUTH_RE } from '@/lib/mcp-probe-cache'
import { isServerShape, type McpServers, normalizeEntry } from '@/lib/mcp-servers'
import { countEnabledTools } from '@/lib/mcp-tool-filter'

/** MCP tab view-model: doc parsing, server status classification, usage cache. */

export const pretty = (value: unknown) => JSON.stringify(value, null, 2)
export const wrapDoc = (entries: McpServers) => pretty({ mcpServers: entries })

/** Accepts `{"mcpServers": {...}}` (ecosystem), a bare name→config map, or throws. */
export function parseServersDoc(raw: string): McpServers {
  const parsed = JSON.parse(raw) as unknown

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object')
  }

  const doc = parsed as Record<string, unknown>

  if (isServerShape(doc)) {
    throw new Error('Wrap the server in {"mcpServers": {"name": …}} so it has a name')
  }

  const wrapper = doc.mcpServers ?? doc.mcp_servers

  const map =
    wrapper && typeof wrapper === 'object' && !Array.isArray(wrapper) ? (wrapper as McpServers) : (doc as McpServers)

  return Object.fromEntries(Object.entries(map).map(([name, entry]) => [name, normalizeEntry(entry)]))
}

// The runtime gate is `enabled: false` — the same flag `hermes mcp` and the
// agent's MCP loader read.
export const serverEnabled = (server: Record<string, unknown>) => server.enabled !== false

// Shared cache for the Nous-approved catalog — feeds both description enrichment
// and the Catalog install view; invalidated after an install.
export const MCP_CATALOG_KEY = ['mcp-catalog'] as const

export type Probe = McpTestResult | 'probing'

// Per-server cost/usage overlay inputs: `tokens` is the approximate per-call
// schema cost from the probe (null = no estimate — older backend or no probe
// yet), `uses` is the 30-day analytics call count (null = analytics
// unavailable, so usage is simply omitted).
export interface ServerCost {
  tokens: null | number
  uses: null | number
}

// 30-day per-tool call counts for the MCP fleet — same shape and TTL rules as
// the Toolsets tab's toolCallsCache (skills/index.tsx), but a 30-day window
// keyed by the Capabilities scope profile. Purely cosmetic: a failed analytics
// fetch caches nothing and the overlay omits usage.
export const MCP_USAGE_TTL_MS = 10 * 60_000
export const mcpUsageCache = new Map<string, { at: number; value: Record<string, number> }>()

export async function loadMcpUsage(scopeKey: string, scopeProfile: ProfileScope): Promise<null | Record<string, number>> {
  const cached = mcpUsageCache.get(scopeKey)

  if (cached && Date.now() - cached.at < MCP_USAGE_TTL_MS) {
    return cached.value
  }

  try {
    const analytics = await getUsageAnalytics(30, scopeProfile)
    const value = Object.fromEntries((analytics.tools ?? []).map(entry => [entry.tool, entry.count]))
    mcpUsageCache.set(scopeKey, { at: Date.now(), value })

    return value
  } catch {
    // Analytics unavailable — degrade to "no usage shown", never an error UI.
    return null
  }
}

export type ServerStatus = 'off' | 'probing' | 'ok' | 'needs-auth' | 'error' | 'unknown'

export function statusOf(server: Record<string, unknown>, probe: Probe | undefined): ServerStatus {
  if (!serverEnabled(server)) {
    return 'off'
  }

  if (probe === 'probing') {
    return 'probing'
  }

  if (!probe) {
    return 'unknown'
  }

  if (probe.ok) {
    return 'ok'
  }

  return NEEDS_AUTH_RE.test(probe.error ?? '') ? 'needs-auth' : 'error'
}

export const STATUS_DOT: Record<ServerStatus, string> = {
  ok: 'bg-emerald-500',
  error: 'bg-red-500',
  'needs-auth': 'bg-amber-500',
  probing: 'animate-pulse bg-foreground/40',
  off: 'bg-foreground/20',
  unknown: 'bg-foreground/20'
}

// "12 tools enabled" / "25 tools, 1 prompts, 103 resources enabled" — only
// the capabilities the server actually has. When a `server` config is passed,
// the tool count reflects the per-tool include/exclude filter (what's actually
// registered), not the raw discovered count. The optional `cost` appends the
// overlay — "…, ~4.2k tok, 3 uses/30d" — with each half omitted when unknown.
export function capabilitySummary(
  m: Translations['settings']['mcp'],
  probe: McpTestResult,
  server?: Record<string, unknown>,
  cost?: ServerCost
): string {
  const toolCount = server
    ? countEnabledTools(
        server,
        probe.tools.map(tool => tool.name)
      )
    : probe.tools.length

  const parts = [m.capabilitySummary(toolCount, probe.prompts ?? 0, probe.resources ?? 0)]

  if (cost && cost.tokens !== null && cost.tokens > 0) {
    parts.push(m.costTokens(compactNumber(cost.tokens)))
  }

  if (cost && cost.uses !== null) {
    parts.push(m.usage30d(compactNumber(cost.uses)))
  }

  return parts.join(', ')
}

export function statusLine(
  m: Translations['settings']['mcp'],
  status: ServerStatus,
  probe: Probe | undefined,
  server?: Record<string, unknown>,
  cost?: ServerCost
): string {
  switch (status) {
    case 'ok':
      return capabilitySummary(m, probe as McpTestResult, server, cost)

    case 'probing':
      return m.statusConnecting

    case 'needs-auth':
      return m.statusNeedsAuth

    case 'error':
      return m.statusError

    case 'off':
      return m.statusOff

    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// Cursor → server-block mapping. A tolerant character walker (not JSON.parse —
// it must work mid-edit) that finds each server's key+object range inside the
// mcpServers container, so the editor cursor selects a server and the block
// can be highlighted.
// ---------------------------------------------------------------------------

interface ServerBlock {
  from: number
  name: string
  to: number
}

export function scanServerBlocks(text: string): ServerBlock[] {
  const skipString = (index: number): number => {
    let i = index + 1

    while (i < text.length) {
      if (text[i] === '\\') {
        i += 2
      } else if (text[i] === '"') {
        return i + 1
      } else {
        i++
      }
    }

    return i
  }

  // Container: the object after "mcpServers"/"mcp_servers", else the doc root.
  let start = -1
  const wrapper = /"mcpServers"|"mcp_servers"/.exec(text)

  if (wrapper) {
    let i = wrapper.index + wrapper[0].length

    while (i < text.length && text[i] !== '{') {
      i++
    }

    start = i
  } else {
    start = text.indexOf('{')
  }

  if (start < 0 || text[start] !== '{') {
    return []
  }

  const blocks: ServerBlock[] = []
  let i = start + 1

  while (i < text.length) {
    const ch = text[i]

    if (ch === '}') {
      break
    }

    if (ch !== '"') {
      i++

      continue
    }

    const keyStart = i
    const keyEnd = skipString(i)
    const name = text.slice(keyStart + 1, keyEnd - 1)
    i = keyEnd

    while (i < text.length && text[i] !== ':') {
      i++
    }

    i++

    while (i < text.length && /\s/.test(text[i])) {
      i++
    }

    if (text[i] === '{') {
      let depth = 0
      let j = i

      while (j < text.length) {
        const c = text[j]

        if (c === '"') {
          j = skipString(j)

          continue
        }

        if (c === '{') {
          depth++
        } else if (c === '}') {
          depth--

          if (depth === 0) {
            j++

            break
          }
        }

        j++
      }

      blocks.push({ from: keyStart, name, to: j })
      i = j
    } else {
      // Non-object value — skip to the next sibling.
      while (i < text.length && text[i] !== ',' && text[i] !== '}') {
        if (text[i] === '"') {
          i = skipString(i)

          continue
        }

        i++
      }
    }
  }

  return blocks
}
