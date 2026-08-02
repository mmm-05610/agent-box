/**
 * MCP List — Available (ACS library) + Installed (from profile config).
 * Library data via useLibrary; profile data via useProfileResources.
 */

import { useCallback, useMemo, useState } from 'react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Textarea } from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { useLibrary, useProfileResources } from '@/hooks'
import {
  applyMcpToProfile, removeMcpFromProfile,
  type ProfileMcp,
} from '@/api'
import type { AgentType, McpServer } from '@/api'

interface McpListProps {
  profileName: string
  agentType?: AgentType
}

export function McpList({ profileName, agentType }: McpListProps) {
  const at = agentType ?? 'claude'
  const { toast } = useToast()
  const { mcpServers: library } = useLibrary(at, ['mcpServers'])
  const { mcp: installed, loading, refresh: reloadInstalled } = useProfileResources(profileName)

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchResults, setSearchResults] = useState<McpServer[]>([])
  const [page, setPage] = useState(0)
  const PER_PAGE = 5
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [detailMcp, setDetailMcp] = useState<ProfileMcp | null>(null)
  const [tick, setTick] = useState(0)

  const installedIds = useMemo(() => new Set(installed.map(s => s.id)), [installed])

  const doSearch = useCallback((q: string) => {
    setSearch(q); setPage(0)
    if (!q.trim()) { setSearchResults([]); return }
    const needle = q.toLowerCase()
    setSearchResults(library.filter(s =>
      (s.name.toLowerCase().includes(needle) || (s.description ?? '').toLowerCase().includes(needle))
      && !installedIds.has(s.id)
    ))
  }, [library, installedIds])

  const effective = (search.trim() ? searchResults : library).filter(s => !installedIds.has(s.id))
  const totalPages = Math.max(1, Math.ceil(effective.length / PER_PAGE))
  const pageItems = effective.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

  const handleApply = useCallback(async (mcpId: string) => {
    setApplyingId(mcpId)
    try {
      await applyMcpToProfile(profileName, mcpId)
      await reloadInstalled()
      setTick(t => t + 1)
      toast({ type: 'success', message: `${mcpId} applied` })
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Apply failed' })
    } finally { setApplyingId(null) }
  }, [reloadInstalled, toast])

  const handleRemove = useCallback(async (mcpId: string) => {
    setRemovingId(mcpId)
    try {
      await removeMcpFromProfile(profileName, mcpId)
      await reloadInstalled()
      setTick(t => t + 1)
      toast({ type: 'success', message: `${mcpId} removed` })
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Remove failed' })
    } finally { setRemovingId(null) }
  }, [reloadInstalled, toast])

  return (
    <div className="space-y-6">
      <Card key={`mcp-avail-${tick}-${installed.length}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Available MCP Servers ({effective.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex gap-2">
            <Input placeholder={`Search ${at} MCP servers...`} value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doSearch(searchInput) }} className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => doSearch(searchInput)} title="Search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            </Button>
          </div>
          {pageItems.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{search.trim() ? 'No matching MCP servers.' : 'No MCP servers available for this agent.'}</p>
          ) : (
            <>
              <div className="space-y-1">
                {pageItems.map(s => (
                  <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{s.name}</span>
                        <Badge variant="neutral" className="text-[10px] px-1.5 py-0">{s.serverConfigParsed?.type ?? 'stdio'}</Badge>
                      </div>
                      {s.description && <div className="text-[11px] text-muted-foreground truncate">{s.description}</div>}
                    </div>
                    <Button size="sm" variant="ghost" isLoading={applyingId === s.id} onClick={() => handleApply(s.id)}>Add</Button>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="mt-2 flex items-center justify-center gap-2 text-xs">
                  <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</Button>
                  <span className="text-muted-foreground">{page + 1} / {totalPages}</span>
                  <Button size="sm" variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card key={`mcp-inst-${installed.length}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Installed MCP Servers ({installed.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-xs text-muted-foreground py-2">Loading...</p>
          : installed.length === 0 ? <p className="text-xs text-muted-foreground py-2">No MCP servers installed. Search above to add.</p>
          : (
            <div className="space-y-1">
              {installed.map(s => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{s.name}</span>
                      <Badge variant="neutral" className="text-[10px] px-1.5 py-0">{s.type || 'stdio'}</Badge>
                    </div>
                    {s.command && <div className="text-[10px] font-mono text-muted-foreground truncate">{s.command}</div>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setDetailMcp(s)}>Detail</Button>
                  <Button size="sm" variant="ghost" isLoading={removingId === s.id} onClick={() => handleRemove(s.id)} className="text-destructive hover:text-destructive">Remove</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {detailMcp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailMcp(null)}>
          <div className="relative max-h-[85vh] w-full max-w-lg rounded-xl bg-card shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-border/60 bg-card rounded-t-xl shrink-0">
              <div><h3 className="font-semibold text-foreground">{detailMcp.name}</h3><p className="text-xs text-muted-foreground">{detailMcp.type} server</p></div>
              <Button variant="ghost" size="sm" onClick={() => setDetailMcp(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </Button>
            </div>
            <div className="overflow-y-auto p-5">
              <Textarea value={JSON.stringify(detailMcp.raw, null, 2)} rows={14} readOnly className="font-mono text-xs" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
