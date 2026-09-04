"use client"

/**
 * Profiles 设置分区（G6）—— agentbox 后端模式下按 harness 管理版本化
 * profile 工件（GET/POST/PUT/DELETE /api/v1/profiles/{harness} 透传）。
 *
 * 流程：选 harness（GET /api/v1/harnesses）→ 列出该 harness 的 profiles
 * （id/revision/digest 表格）→ 新建（name + JSON payload，POST）/ 编辑
 * （GET 回填 + PUT，乐观并发 expected_revision）/ 删除（两步内联确认）。
 *
 * 连接未启用时给出 localStorage 引导文案（studio:backend=agentbox 与
 * studio:agentboxUrl/Token）。注册进 settings-shell-panels（id:
 * agentbox-profiles），内容经 /settings/agentbox-profiles 静态路由呈现。
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { AgentBoxProfile } from "@/core/ports/backend-agentbox"
import {
  getAgentBoxProfilesApi,
  listAgentBoxHarnesses,
  type AgentBoxHarnessInfo,
} from "../api"
import { useAgentBoxEnabled } from "../use-agent-box-enabled"

// ── profile 行字段读取（wire 形状宽容：profile_id|id、payload|native_payload） ──

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function profileIdOf(profile: AgentBoxProfile): string {
  return str(profile["profile_id"] ?? profile["id"])
}

function profileNameOf(profile: AgentBoxProfile): string {
  return str(profile["name"]) || profileIdOf(profile)
}

function profileRevisionOf(profile: AgentBoxProfile): number {
  return typeof profile["revision"] === "number" ? profile["revision"] : 0
}

function profileDigestOf(profile: AgentBoxProfile): string {
  return str(profile["digest"])
}

function profilePayloadOf(profile: AgentBoxProfile): Record<string, unknown> {
  const value = profile["payload"] ?? profile["native_payload"]
  return isRecord(value) ? value : {}
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function parsePayload(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text)
  if (!isRecord(parsed)) {
    throw new Error("Payload must be a JSON object")
  }
  return parsed
}

// ── 编辑器状态 ──

interface EditorState {
  mode: "create" | "edit"
  /** edit 模式：目标 profile id 与乐观并发基线 */
  profileId?: string
  expectedRevision?: number
}

const EMPTY_PAYLOAD_TEXT = "{\n  \n}"

export function AgentBoxProfilesSettingsSection() {
  const enabled = useAgentBoxEnabled()

  const [harnesses, setHarnesses] = useState<AgentBoxHarnessInfo[] | null>(null)
  const [harnessError, setHarnessError] = useState<string | null>(null)
  const [harness, setHarness] = useState<string>("")

  const [profiles, setProfiles] = useState<AgentBoxProfile[] | null>(null)
  const [profilesError, setProfilesError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [editor, setEditor] = useState<EditorState | null>(null)
  const [name, setName] = useState("")
  const [payloadText, setPayloadText] = useState(EMPTY_PAYLOAD_TEXT)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null
  )

  // 门面（连接缓存命中后稳定；未启用为 null）
  const profilesApi = useMemo(
    () => (enabled ? getAgentBoxProfilesApi() : null),
    [enabled]
  )

  // harness 列表（启用后加载，默认选中第一个）
  useEffect(() => {
    if (!enabled) return
    let disposed = false
    setHarnesses(null)
    setHarnessError(null)
    listAgentBoxHarnesses()
      .then((rows) => {
        if (disposed) return
        setHarnesses(rows)
        setHarness((current) => current || rows[0]?.harness_type || "")
      })
      .catch((err) => {
        if (!disposed) setHarnessError(toMessage(err))
      })
    return () => {
      disposed = true
    }
  }, [enabled])

  const loadProfiles = useCallback(
    async (target: string) => {
      if (!profilesApi || !target) return
      setProfiles(null)
      setProfilesError(null)
      try {
        setProfiles(await profilesApi.list(target))
      } catch (err) {
        setProfilesError(toMessage(err))
      }
    },
    [profilesApi]
  )

  useEffect(() => {
    if (harness) void loadProfiles(harness)
  }, [harness, loadProfiles])

  const openCreate = useCallback(() => {
    setEditor({ mode: "create" })
    setName("")
    setPayloadText(EMPTY_PAYLOAD_TEXT)
    setFormError(null)
  }, [])

  const openEdit = useCallback(
    async (profile: AgentBoxProfile) => {
      if (!profilesApi || !harness) return
      const id = profileIdOf(profile)
      setFormError(null)
      let payload = profilePayloadOf(profile)
      try {
        // 列表行不带 payload：编辑前 GET 当前版本回填
        payload = profilePayloadOf(
          await profilesApi.get(harness, id, profileRevisionOf(profile))
        )
      } catch {
        // 回填失败不阻塞编辑：退回列表行携带的 payload（可能为空对象）
      }
      setEditor({
        mode: "edit",
        profileId: id,
        expectedRevision: profileRevisionOf(profile),
      })
      setName(profileNameOf(profile))
      setPayloadText(JSON.stringify(payload, null, 2))
    },
    [profilesApi, harness]
  )

  const closeEditor = useCallback(() => {
    setEditor(null)
    setFormError(null)
  }, [])

  const submitEditor = useCallback(async () => {
    if (!profilesApi || !harness || !editor) return
    let payload: Record<string, unknown>
    try {
      payload = parsePayload(payloadText)
    } catch (err) {
      setFormError(`Invalid JSON: ${toMessage(err)}`)
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      if (editor.mode === "create") {
        const trimmed = name.trim()
        if (!trimmed) {
          setFormError("Name is required")
          return
        }
        await profilesApi.create(harness, { name: trimmed, payload })
      } else if (editor.profileId) {
        await profilesApi.update(
          harness,
          editor.profileId,
          payload,
          editor.expectedRevision
        )
      }
      closeEditor()
      await loadProfiles(harness)
    } catch (err) {
      setFormError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }, [
    profilesApi,
    harness,
    editor,
    name,
    payloadText,
    closeEditor,
    loadProfiles,
  ])

  const deleteProfile = useCallback(
    async (profileId: string) => {
      if (!profilesApi || !harness) return
      setBusy(true)
      try {
        await profilesApi.remove(harness, profileId)
        setConfirmingDeleteId(null)
        await loadProfiles(harness)
      } catch (err) {
        setProfilesError(toMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [profilesApi, harness, loadProfiles]
  )

  // ── 未启用：localStorage 引导 ──
  if (!enabled) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md space-y-2 rounded-xl border bg-card p-4 text-xs">
          <h1 className="text-sm font-semibold">Profiles</h1>
          <p className="text-muted-foreground">
            AgentBox backend is not enabled. Set the following localStorage keys
            to activate it:
          </p>
          <ul className="space-y-1 font-mono text-2xs text-foreground/80">
            <li>studio:backend = agentbox</li>
            <li>studio:agentboxUrl = http://&lt;host&gt;:&lt;port&gt;</li>
            <li>studio:agentboxToken = &lt;AGENT_BOX_STUDIO_TOKEN&gt;</li>
          </ul>
          <p className="text-2xs text-muted-foreground">
            需在 localStorage 设置 studio:backend=agentbox 与
            studio:agentboxUrl/Token。
          </p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="w-full space-y-4 p-3 md:p-4">
        <section className="space-y-1">
          <h1 className="text-sm font-semibold">Profiles</h1>
          <p className="text-xs text-muted-foreground">
            Versioned profile artifacts per harness, managed by the AgentBox
            profile store (id / revision / digest are server-authoritative).
          </p>
        </section>

        {/* Harness 选择 */}
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Harness</span>
            <Select
              value={harness}
              onValueChange={(next) => {
                setConfirmingDeleteId(null)
                setHarness(next)
              }}
            >
              <SelectTrigger className="h-8 w-56 text-xs" aria-label="Harness">
                <SelectValue
                  placeholder={
                    harnesses === null ? "Loading harnesses…" : "Pick a harness"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(harnesses ?? []).map((row) => (
                  <SelectItem
                    key={row.harness_type}
                    value={row.harness_type}
                    className="text-xs"
                  >
                    {row.display_name || row.harness_type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {harness && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void loadProfiles(harness)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            )}
          </div>
          {harnessError && (
            <p className="text-2xs text-red-400">{harnessError}</p>
          )}
        </section>

        {/* Profiles 表格 */}
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold">
              {harness ? `Profiles · ${harness}` : "Profiles"}
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={openCreate}
              disabled={!harness}
            >
              <Plus className="h-3.5 w-3.5" />
              New Profile
            </Button>
          </div>

          {profilesError && (
            <p className="text-2xs text-red-400">{profilesError}</p>
          )}

          {profiles === null ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading profiles…
            </div>
          ) : profiles.length === 0 ? (
            <p className="py-4 text-xs text-muted-foreground">
              No profiles yet for this harness.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">ID</th>
                  <th className="py-1.5 pr-3 font-medium">Name</th>
                  <th className="py-1.5 pr-3 font-medium">Revision</th>
                  <th className="py-1.5 pr-3 font-medium">Digest</th>
                  <th className="py-1.5 pr-3 text-right font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => {
                  const id = profileIdOf(profile)
                  const digest = profileDigestOf(profile)
                  return (
                    <tr key={id} className="border-b last:border-0">
                      <td className="py-1.5 pr-3 font-mono">{id}</td>
                      <td className="py-1.5 pr-3">{profileNameOf(profile)}</td>
                      <td className="py-1.5 pr-3 tabular-nums">
                        v{profileRevisionOf(profile)}
                      </td>
                      <td
                        className="py-1.5 pr-3 font-mono text-muted-foreground"
                        title={digest}
                      >
                        {digest.slice(0, 12) || "—"}
                      </td>
                      <td className="py-1.5 pr-3">
                        <div className="flex items-center justify-end gap-1">
                          {confirmingDeleteId === id ? (
                            <>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={busy}
                                onClick={() => void deleteProfile(id)}
                              >
                                Confirm delete
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                aria-label={`Cancel delete ${id}`}
                                onClick={() => setConfirmingDeleteId(null)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                aria-label={`Edit ${id}`}
                                disabled={busy}
                                onClick={() => void openEdit(profile)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                aria-label={`Delete ${id}`}
                                disabled={busy}
                                onClick={() => setConfirmingDeleteId(id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* 新建 / 编辑表单 */}
        {editor && (
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold">
                {editor.mode === "create"
                  ? "New Profile"
                  : `Edit ${editor.profileId ?? ""}`}
              </h2>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Close editor"
                onClick={closeEditor}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="agentbox-profile-name"
                className="text-2xs text-muted-foreground"
              >
                Name
              </label>
              <Input
                id="agentbox-profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={editor.mode === "edit" || busy}
                placeholder="work"
                className="h-8 max-w-xs text-xs"
              />
              {editor.mode === "edit" && (
                <p className="text-2xs text-muted-foreground">
                  Name is immutable on revision; editing submits a new payload
                  revision (expected revision v{editor.expectedRevision ?? 0}).
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label
                htmlFor="agentbox-profile-payload"
                className="text-2xs text-muted-foreground"
              >
                Payload (JSON)
              </label>
              <Textarea
                id="agentbox-profile-payload"
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                disabled={busy}
                rows={8}
                className="font-mono text-2xs"
                spellCheck={false}
              />
            </div>

            {formError && <p className="text-2xs text-red-400">{formError}</p>}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => void submitEditor()}
                disabled={busy}
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editor.mode === "create" ? "Create profile" : "Save revision"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={closeEditor}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </section>
        )}
      </div>
    </ScrollArea>
  )
}
