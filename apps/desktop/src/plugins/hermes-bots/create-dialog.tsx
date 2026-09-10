/**
 * The two creation dialogs: New Bot, and the group-chat creation flow the
 * roster's group button opens (plus the per-bot group membership dialog it
 * sits beside).
 *
 * New Bot creates its profile LAZILY, so it owns the single-flight guard and
 * the name pattern that gates the draft.
 */

import {
  Badge,
  Button,
  Checkbox,
  cn,
  Codicon,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DisclosureCaret,
  GlyphSpinner,
  host,
  Input,
  queryClient,
  RowButton,
  SearchField,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useI18n,
  useValue
} from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'

import { avatarColor, blobatarSvg, botAppearance, BotFace } from './avatar'
import { isBackfilledFacePng } from './avatar-image'
import { AvatarPicker } from './avatar-picker'
import { $selectedBot } from './bot-state'
import { createCanonicalChat } from './canonical-chat'
import { $botMeta, botHandle, botRosterKey, filterBots, ROSTER_KEY, saveBotMeta } from './data'
import { labeled, ResizableFrame } from './dialog-parts'
import { GROUP_CHAT_MAX_MEMBERS, mintGroupRoomId, uniqueGroupChatName, updateGroupChat } from './group-chat'
import type { GroupChatRoom } from './group-chat'
import { GroupImageControls } from './group-chat-parts'
import {
  botGroups,
  durableGroupChatMembers,
  groupMembershipPatch,
  knownGroups,
  liveGroupChatNames
} from './group-membership'
import { useBots } from './i18n'
import { displayName, slugify } from './labels'
import { McpSetupButton } from './mcp-setup'
import { ModelPicker } from './model-picker'
import type {
  CapabilityEntry,
  McpCatalogResponse,
  ProfileConfigurePayload,
  ProfileDescribeResponse
} from './profile-config'
import { CheckList, SkillsView, skillsViewRoutesConnections } from './profile-config'
import { deleteBot } from './profile-ops'
import { botRosterMeta } from './routing'
import { HubSkillsSection } from './skills-hub'
import { composeSoul } from './soul'
import type { BotMeta, ConnectionRow, RosterRow } from './types'
import { singleFlight } from './single-flight'
import { GroupDialog, CreateGroupChatDialog } from './group-dialogs'

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/

/** Share one in-flight async operation across concurrent callers. Failures
 * clear the slot so a later attempt can retry. */

// ── create dialog ────────────────────────────────────────────────────────────

/** The clone source's capability catalog, staged before the profile exists. */
interface CapabilityCatalog {
  mcp: CapabilityEntry[]
  skills: CapabilityEntry[]
  source: string
  toolsets: CapabilityEntry[]
}
interface CreateAgentDialogProps {
  onClose: () => void
  open: boolean
  roster: RosterRow[]
}

export function CreateAgentDialog({ open, onClose, roster }: CreateAgentDialogProps) {
  const { t } = useI18n()
  const b = useBots()
  const [name, setName] = useState('')
  // Create mode: the profile is created LAZILY. Capability toggles are staged in
  // component state; the profile is materialized either on Create (submit) or on
  // the first MCP credential setup (ensureAgentCreated), whichever comes first —
  // so OAuth / API-key setup works DURING creation, not only after in Edit.
  const createdRef = useRef<null | string>(null)
  // In-flight profiles.create shared across concurrent triggers (Create
  // button + MCP setup buttons). Distinct from createdRef on purpose:
  // createdRef must stay a slug string for its sibling consumers.
  const flightRef = useRef<Promise<null | string> | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  // Default shapes mode: deterministic blob face drawn from the agent's name
  // (falls back to the legacy shape vocabulary on older SDKs).
  const [shape, setShape] = useState(blobatarSvg ? 'blobatar' : 'circle')
  const [color, setColor] = useState<null | string>(null)
  const [image, setImage] = useState<null | string>(null)
  const [advanced, setAdvanced] = useState(false)
  const [cloneFrom, setCloneFrom] = useState('default')
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState('')
  const [soul, setSoul] = useState('')
  const [noSkills, setNoSkills] = useState(false)
  const [shareAuth, setShareAuth] = useState(true)
  const [advTab, setAdvTab] = useState('general')
  // Where the profile is created: '' = the active gateway (unchanged default),
  // else a registry connection id — the profiles.create lands on THAT
  // machine's backend via host.requestProfile, no gateway switch. Only
  // rendered when the desktop has a multi-connection registry.
  const [targetConnection, setTargetConnection] = useState('')
  const [connections, setConnections] = useState<ConnectionRow[] | null>(null)
  useEffect(() => {
    if (
      !open ||
      connections !== null ||
      typeof host.connections !== 'function' ||
      typeof host.requestProfile !== 'function'
    ) {
      return
    }

    host
      .connections()
      // host.connections() returns the registry ROWS on current SDKs, but the
      // envelope object ({version, primary, connections: [...]}) on desktops
      // that predate the SDK-side unwrap — accept both shapes.
      .then((value: ConnectionRow[] | { connections?: ConnectionRow[] }) =>
        setConnections(Array.isArray(value) ? value : Array.isArray(value?.connections) ? value.connections : [])
      )
      .catch(() => setConnections([]))
  }, [open, connections])
  const activeConnectionId = String(host.state?.connectionId?.get?.() || '').trim()
  // Remote target = an explicitly picked registry connection that is not the
  // one this window is already on.
  const remoteTarget = Boolean(targetConnection) && targetConnection !== (activeConnectionId || 'local')

  const targetLabel = remoteTarget
    ? (connections || []).find(c => c.id === targetConnection)?.label || targetConnection
    : ''

  /** Gateway RPC on the create target: the picked connection's default
   *  backend for remote targets, the active gateway otherwise. */
  const requestForTarget = <T,>(method: string, params: Record<string, unknown> = {}): Promise<T> =>
    remoteTarget
      ? host.requestProfile(
          {
            connectionId: targetConnection,
            mode: 'remote',
            profile: 'default',
            targetProfile: 'default'
          },
          method,
          params
        )
      : host.request(method, params)

  // Set once ensureAgentCreated() materializes the profile for the live
  // Capabilities tab (SkillsView needs a real backend to point at). State —
  // not just createdRef — because the render must flip when it lands.
  const [createdForCaps, setCreatedForCaps] = useState<null | string>(null)
  const [caps, setCaps] = useState<CapabilityCatalog | null>(null)
  const [capsFailed, setCapsFailed] = useState(false)

  const [dirtyCaps, setDirtyCaps] = useState({
    skills: false,
    toolsets: false,
    mcp: false
  })

  const [capFilter, setCapFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const slug = slugify(name)
  const valid = slug.length > 0 && NAME_RE.test(slug)

  // Once the draft profile is materialized (Capabilities tab / MCP setup) it
  // shows up in the roster — its OWN slug must not read as "taken".
  // A remote-target create is gated by the TARGET machine's roster: a local
  // name clash is fine there, and the remote's own duplicate check rejects
  // real collisions at profiles.create time.
  const taken = remoteTarget
    ? roster.some(
        b => b.remoteSource && b.connectionId === targetConnection && b.name === slug && b.name !== createdRef.current
      )
    : roster.some(b => !b.remoteSource && b.name === slug && b.name !== createdRef.current)

  // Draft semantics for the lazily-created profile: opening the Capabilities
  // tab (or running MCP setup) materializes the profile so the LIVE config
  // surfaces have a real backend to write to — but until the user hits
  // Create Agent it is a DRAFT. Cancelling the dialog deletes it, so
  // preconfigure-then-back-out leaves zero residue. Best-effort and
  // fire-and-forget: a failed cleanup surfaces a toast, never blocks close.
  const discardDraft = () => {
    const draft = createdRef.current

    if (!draft) {
      return
    }

    createdRef.current = null
    flightRef.current = null

    const discard = remoteTarget
      ? requestForTarget('cli.exec', {
          argv: ['profile', 'delete', draft, '--yes']
        })
      : deleteBot({
          name: draft
        })

    void Promise.resolve(discard)
      .then(() =>
        host.notify({
          kind: 'success',
          message: `Draft agent "${draft}" discarded`
        })
      )
      .catch(err => host.notifyError(err, `Could not clean up draft profile "${draft}"`))
  }

  const reset = () => {
    setName('')
    setTitle('')
    setDescription('')
    setShape(blobatarSvg ? 'blobatar' : 'circle')
    setColor(null)
    setImage(null)
    setAdvanced(false)
    // Same default as the initial useState — resetting to '__none__' made
    // the second agent you create silently start from a fresh profile
    // instead of cloning the main one like the first dialog open did.
    setCloneFrom('default')
    setModel('')
    setProvider('')
    setSoul('')
    setNoSkills(false)
    setShareAuth(true)
    setAdvTab('general')
    setCreatedForCaps(null)
    setCaps(null)
    setCapsFailed(false)
    setDirtyCaps({
      skills: false,
      toolsets: false,
      mcp: false
    })
    setCapFilter('')
    setTargetConnection('')
    setBusy(false)
    setError(null)
    createdRef.current = null
    flightRef.current = null
  }

  // Capability catalog for the tabs: the profile doesn't exist yet, so show
  // what it WILL have — the clone source's catalog, else the main profile's.
  const capSource = cloneFrom === '__none__' ? 'default' : cloneFrom

  const ensureCaps = () => {
    if ((caps && caps.source === capSource) || capsFailed) {
      return
    }

    Promise.all([
      requestForTarget<ProfileDescribeResponse>('profiles.describe', {
        name: remoteTarget ? 'default' : capSource
      }),
      requestForTarget<McpCatalogResponse>('mcp.catalog', {}).catch(() => null)
    ])
      .then(([res, cat]) => {
        // Full MCP menu = the profile's configured servers + the bundled
        // catalog (installable). Configured entries win on name clash.
        const configured = res.mcp_servers || []
        const have = new Set(configured.map(m => m.name))
        const catalog = ((cat && cat.servers) || []).filter(s => !have.has(s.name))
        setCaps({
          source: capSource,
          skills: res.skills || [],
          toolsets: res.toolsets || [],
          mcp: [
            ...configured,
            ...catalog.map(s => ({
              name: s.name,
              enabled: false,
              fromCatalog: true,
              installed: s.installed,
              auth: s.auth,
              requires: s.requires || [],
              description: s.description || ''
            }))
          ]
        })
      })
      .catch(() => setCapsFailed(true))
  }

  const toggleCap = (kind: 'mcp' | 'skills' | 'toolsets', name: string, enabled: boolean) => {
    setDirtyCaps(prev => ({
      ...prev,
      [kind === 'mcp' ? 'mcp' : kind]: true
    }))
    setCaps(prev =>
      prev
        ? {
            ...prev,
            [kind]: prev[kind].map(x =>
              x.name === name
                ? {
                    ...x,
                    enabled
                  }
                : x
            )
          }
        : prev
    )
  }

  // Materialize the profile exactly once. createdRef stores the finished slug
  // (its consumers — the taken check, draft discard on cancel, the MCP setup
  // button's profile param — all read a string); flightRef shares the
  // in-flight creation promise so simultaneous MCP setup / Create clicks fire
  // ONE profiles.create. A settled flight clears its slot: failures retry,
  // and a null result (form invalid at flight time) isn't sticky.
  const ensureAgentCreated = (): Promise<null | string> => {
    // Renamed since the draft materialized? The old draft is orphaned —
    // discard it and create fresh under the new slug.
    if (createdRef.current && createdRef.current !== slug) {
      discardDraft()
      setCreatedForCaps(null)
    }

    if (createdRef.current) {
      return Promise.resolve(createdRef.current)
    }

    const flight = singleFlight(flightRef, async () => {
      if (!valid || taken) {
        return null
      }

      const descriptionText = [title, description].filter(Boolean).join(' — ')
      await requestForTarget('profiles.create', {
        name: slug,
        description: descriptionText,
        // Clone sources are profiles of the TARGET backend. The picker's
        // roster is the local one, so a remote create always starts from the
        // remote machine's default (or fresh) — never a local profile name
        // the remote box doesn't have.
        clone_from: cloneFrom === '__none__' ? null : remoteTarget ? 'default' : cloneFrom,
        no_skills: noSkills,
        // Shared (not copied) auth keeps ONE OAuth/token pool with the main
        // profile, so refreshes can't invalidate each other. Older gateways
        // ignore the param and copy — still functional, just forked.
        share_auth: shareAuth,
        soul: composeSoul({
          name: slug,
          title,
          description,
          roster,
          customSoul: soul
        }),
        ...(model.trim() && provider.trim()
          ? {
              model: model.trim(),
              provider: provider.trim()
            }
          : {})
      })
      createdRef.current = slug

      // Apply capability picks from the Advanced tabs (best-effort; the
      // profile exists either way and Edit Profile can finish the job).
      try {
        const capPayload: Pick<
          ProfileConfigurePayload,
          'disabled_skills' | 'enabled_mcp_servers' | 'enabled_toolsets'
        > = {}

        if (dirtyCaps.skills && caps) {
          capPayload.disabled_skills = caps.skills.filter(s => !s.enabled).map(s => s.name)
        }

        if (dirtyCaps.toolsets && caps) {
          const en = caps.toolsets.filter(t => t.enabled)
          capPayload.enabled_toolsets = en.length === caps.toolsets.length || en.length === 0 ? [] : en.map(t => t.name)
        }

        if (dirtyCaps.mcp && caps) {
          capPayload.enabled_mcp_servers = caps.mcp.filter(m => m.enabled).map(m => m.name)
        }

        if (Object.keys(capPayload).length) {
          await requestForTarget('profiles.configure', {
            name: slug,
            ...capPayload
          })
        }
      } catch {
        /* capability application is best-effort */
      }

      if (remoteTarget) {
        // The bot lives on ANOTHER machine — local bot-meta is scoped to the
        // active gateway, so write appearance/title into the remote
        // profile's ui_meta (and asset store) directly. Best-effort: the
        // profile exists either way.
        const { image: avatarImage, ...look } = {
          shape,
          color,
          image,
          imageKind: image ? 'photo' : 'shape',
          title: title.trim(),
          created: Date.now()
        }

        try {
          void requestForTarget('profiles.configure', {
            name: slug,
            ui_meta: {
              'hermes-bots': look
            }
          }).catch(() => undefined)

          if (avatarImage) {
            void requestForTarget('profiles.set_asset', {
              name: slug,
              asset: 'avatar',
              data: avatarImage
            }).catch(() => undefined)
          }
        } catch {
          /* older remote gateway */
        }
      } else {
        saveBotMeta(slug, {
          shape,
          color: color ?? undefined,
          image,
          imageKind: image ? 'photo' : 'shape',
          title: title.trim(),
          created: Date.now()
        })
      }

      queryClient.invalidateQueries({
        queryKey: ROSTER_KEY
      })

      return slug
    })

    return flight
  }

  const submit = async () => {
    if (!valid || taken || busy) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const slugCreated = await ensureAgentCreated()

      if (!slugCreated) {
        setBusy(false)
        setError('Could not create the bot.')

        return
      }

      host.notify({
        kind: 'success',
        message: remoteTarget
          ? `Bot "${displayName({
              name: slug,
              title
            })}" created on ${targetLabel}`
          : `Bot "${displayName({
              name: slug,
              title
            })}" created`
      })
      const wasRemote = remoteTarget
      reset()
      onClose()

      if (wasRemote) {
        // The bot lives on another machine: it appears in the roster via the
        // union enumeration; chat routes through its own source. No local
        // canonical chat to birth here.
        queryClient.invalidateQueries({
          queryKey: ROSTER_KEY
        })

        return
      }

      $selectedBot.set(slug)

      // Birth the bot's forever chat right away: it introduces itself as
      // the first thing the user sees, and the pin exists from minute one.
      try {
        // Creates, pins, opens, and kicks off the intro in one flow. This is
        // the ONE caller allowed to request the intro turn — genuine New
        // Agent creation. Click-path resolution (openBotCanonicalChat) mints
        // silently so a resolution miss never burns a turn (ScottFive).
        const sid = await createCanonicalChat(slug, {
          kickoff: true
        })

        if (!sid && typeof host.newChat === 'function') {
          host.newChat(slug)
        }
      } catch {
        if (typeof host.newChat === 'function') {
          host.newChat(slug)
        }
      }
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Dialog
      onOpenChange={value => {
        if (!value && !busy) {
          // Cancel path (esc / overlay click): a materialized draft profile is
          // discarded — preconfigure-then-back-out leaves nothing behind.
          discardDraft()
          reset()
          onClose()
        }
      }}
      open={open}
    >
      <DialogContent
        className={advanced ? 'max-w-3xl' : 'max-w-md'} // Native resize handle (bottom-right corner): the dialog becomes a
        // window the user can grow/shrink. overflow:auto is required for CSS
        // resize to engage; caps keep it on screen.
        style={
          advanced
            ? {
                resize: 'both',
                overflow: 'auto',
                minWidth: 420,
                minHeight: 360,
                maxWidth: '95vw',
                maxHeight: '90vh'
              }
            : undefined
        }
      >
        <DialogHeader>
          <DialogTitle>{b.bot.newTitle}</DialogTitle>
          <DialogDescription>
            A named teammate with its own memory, skills, and chat. It can message your other agents.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3.5">
          <div className="flex justify-center py-1">
            <BotFace
              color={avatarColor(color, slug || 'agent')}
              image={image}
              name={slug || 'agent'}
              shape={shape}
              size={56}
            />
          </div>
          <AvatarPicker
            color={color}
            generateSeed={{
              name: slug || 'agent',
              title,
              description
            }}
            image={image}
            onColor={setColor}
            onImage={setImage}
            onShape={setShape}
            shape={shape}
          />
          {labeled(
            'Name',
            <Input autoFocus onChange={event => setName(event.target.value)} placeholder="inbox-triage" value={name} />
          )}
          {taken ? (
            <div className="text-xs text-(--ui-accent)">
              {remoteTarget
                ? `An agent named "${slug}" already exists on ${targetLabel}.`
                : `An agent named "${slug}" already exists.`}
            </div>
          ) : null}
          {/* Multi-connection desktops choose WHERE the agent lives. Hidden */
          /* on single-connection setups — the active gateway is the only */
          /* possible home, exactly the old behavior. */}
          {Array.isArray(connections) && connections.length > 1
            ? labeled(
                'Create on',
                <Select
                  onValueChange={value => {
                    setTargetConnection(value === (activeConnectionId || 'local') ? '' : value)
                    // The capability catalog and clone list belong to the
                    // target backend — refetch for the new home. The live
                    // Capabilities tab re-pins to it via fixedConnection on
                    // builds that route it (staged checklists otherwise).
                    setCaps(null)
                    setCapsFailed(false)
                    setAdvTab('general')
                  }}
                  value={targetConnection || activeConnectionId || 'local'}
                >
                  <SelectTrigger className="h-8 rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map(connection => (
                      <SelectItem key={connection.id} value={connection.id}>
                        {connection.id === (activeConnectionId || 'local')
                          ? `${connection.label || connection.id} (current)`
                          : connection.label || connection.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            : null}
          {remoteTarget ? (
            <div className="text-[0.7rem] leading-5 text-(--ui-text-tertiary)">{`The agent is created on ${targetLabel} and appears in the roster as a Connections bot. Chat routes to that machine.`}</div>
          ) : null}
          {labeled(
            'Title',
            <Input onChange={event => setTitle(event.target.value)} placeholder="Inbox Triage" value={title} />
          )}
          {labeled(
            'Description',
            <Textarea
              className="min-h-16"
              onChange={event => setDescription(event.target.value)}
              placeholder={b.bot.helpPromptPlaceholder}
              value={description}
            />
          )}
          <Button
            className="flex items-center gap-1 text-xs font-medium text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)"
            onClick={() => {
              setAdvanced(v => {
                if (!v) {
                  ensureCaps()
                }

                return !v
              })
            }}
            size="inline"
            variant="text"
          >
            <DisclosureCaret open={advanced} />
            {b.bot.advanced}
          </Button>
          {advanced ? (
            <div className="grid gap-3 rounded-md border border-(--ui-stroke-secondary) p-3">
              <SegmentedControl
                onChange={id => {
                  setAdvTab(id)
                  setCapFilter('')

                  if (id === 'capabilities') {
                    // The live surface needs a real profile —
                    // materialize it now (same lazy-create door
                    // the MCP setup buttons use).
                    void ensureAgentCreated()
                      .then(created => created && setCreatedForCaps(created))
                      .catch(err => host.notifyError(err, b.bot.createFailed))
                  } else if (id !== 'general') {
                    ensureCaps()
                  }
                }}
                options={
                  SkillsView && (!remoteTarget || skillsViewRoutesConnections)
                    ? [
                        { id: 'general', label: 'General' },
                        { id: 'capabilities', label: 'Capabilities' }
                      ]
                    : [
                        { id: 'general', label: 'General' },
                        { id: 'skills', label: 'Skills' },
                        { id: 'toolsets', label: 'Tools' },
                        { id: 'mcp', label: 'MCP' }
                      ]
                }
                value={advTab}
              />
              {advTab === 'general' ? (
                <div className="grid gap-3.5">
                  {labeled(
                    remoteTarget ? `Clone from profile (on ${targetLabel})` : 'Clone from profile',
                    <Select
                      disabled={remoteTarget}
                      onValueChange={value => {
                        setCloneFrom(value)
                        setCaps(null)
                        setCapsFailed(false)
                      }}
                      value={remoteTarget ? 'default' : cloneFrom}
                    >
                      <SelectTrigger className="h-8 rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Fresh profile (bundled skills)</SelectItem>
                        {roster.map(b => (
                          <SelectItem key={b.name} value={b.name}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <ModelPicker
                    onChange={patch => {
                      if ('provider' in patch) {
                        setProvider(patch.provider)
                      }

                      if ('model' in patch) {
                        setModel(patch.model)
                      }
                    }}
                    placeholderModel="inherited from launch profile"
                    value={{
                      provider,
                      model
                    }}
                  />
                  {labeled(
                    'SOUL.md (optional — replaces the generated persona)',
                    <Textarea
                      className="min-h-24 font-mono text-xs leading-5"
                      onChange={event => setSoul(event.target.value)}
                      placeholder={b.avatar.describeHint}
                      value={soul}
                    />
                  )}
                  <label className="flex items-center gap-2 text-xs text-(--ui-text-secondary)">
                    <Checkbox checked={shareAuth} onCheckedChange={value => setShareAuth(Boolean(value))} />
                    Share keys & accounts with the main profile
                  </label>
                  <div className="pl-6 pt-0.5 text-[0.7rem] leading-5 text-(--ui-text-tertiary)">
                    Subscriptions, OAuth logins, and API keys stay shared (not copied), so token refreshes never
                    invalidate each other. Uncheck for an isolated snapshot copy.
                  </div>
                  <label className="flex items-center gap-2 text-xs text-(--ui-text-secondary)">
                    <Checkbox checked={noSkills} onCheckedChange={value => setNoSkills(Boolean(value))} />
                    Create empty (skip bundled skills)
                  </label>
                </div>
              ) : advTab === 'capabilities' ? (
                !valid || taken ? (
                  <div className="px-2 py-3 text-center text-xs text-(--ui-text-tertiary)">
                    {taken
                      ? 'That name is taken — pick another before configuring capabilities.'
                      : 'Name the bot first — a draft profile is created when you open this tab (discarded if you cancel).'}
                  </div>
                ) : !createdForCaps ? (
                  <div className="flex justify-center py-4">
                    <GlyphSpinner className="text-(--ui-text-tertiary)" spinner="breathe" />
                  </div>
                ) : SkillsView ? (
                  <ResizableFrame height={440} minHeight={280}>
                    <SkillsView
                      embedded
                      fixedProfile={createdForCaps}
                      {...(remoteTarget
                        ? {
                            fixedConnection: targetConnection
                          }
                        : {})}
                    />
                  </ResizableFrame>
                ) : (
                  // The tab list is gated on the same export, so this is only
                  // reachable via persisted tab state on a build that lacks it
                  // — a message rather than rendering `undefined` as a
                  // component, which throws.
                  <div className="px-2 py-3 text-center text-xs text-(--ui-text-tertiary)">
                    Skills need a newer Hermes Desktop.
                  </div>
                )
              ) : capsFailed ? (
                <div className="px-2 py-3 text-center text-xs text-(--ui-text-tertiary)">
                  Capability catalog needs a newer gateway (restart it after updating Hermes).
                </div>
              ) : !caps ? (
                <div className="flex justify-center py-4">
                  <GlyphSpinner className="text-(--ui-text-tertiary)" spinner="breathe" />
                </div>
              ) : advTab === 'skills' ? (
                noSkills ? (
                  <div className="px-2 py-3 text-center text-xs text-(--ui-text-tertiary)">
                    “Create empty” is checked — no bundled skills will be installed.
                  </div>
                ) : (
                  <div className="grid gap-1.5">
                    <Input
                      className="h-7 text-xs"
                      onChange={event => setCapFilter(event.target.value)}
                      placeholder={b.tools.filterSkills}
                      value={capFilter}
                    />
                    <div
                      className="overflow-y-auto overscroll-contain"
                      style={{
                        maxHeight: 200
                      }}
                    >
                      <CheckList
                        columns={2}
                        items={
                          capFilter.trim()
                            ? caps.skills.filter(s => s.name.toLowerCase().includes(capFilter.trim().toLowerCase()))
                            : caps.skills
                        }
                        onToggle={(name, enabled) => toggleCap('skills', name, enabled)}
                      />
                    </div>
                    <div className="text-[0.65rem] leading-4 text-(--ui-text-quaternary)">{`Catalog from ${caps.source} — unchecked skills are disabled after creation.`}</div>
                    <HubSkillsSection
                      forProfile={null}
                      onInstalled={name =>
                        setCaps(prev =>
                          !prev || prev.skills.some(s => s.name === name)
                            ? prev
                            : {
                                ...prev,
                                skills: [
                                  ...prev.skills,
                                  {
                                    name,
                                    enabled: true
                                  }
                                ]
                              }
                        )
                      }
                    />
                  </div>
                )
              ) : advTab === 'toolsets' ? (
                <div className="grid gap-1.5">
                  <div
                    className="overflow-y-auto overscroll-contain"
                    style={{
                      maxHeight: 200
                    }}
                  >
                    <CheckList
                      columns={2}
                      items={caps.toolsets}
                      onToggle={(name, enabled) => toggleCap('toolsets', name, enabled)}
                    />
                  </div>
                  <div className="text-[0.65rem] leading-4 text-(--ui-text-quaternary)">
                    Leaving all (or none) checked keeps the default toolset behavior.
                  </div>
                </div>
              ) : caps.mcp.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-(--ui-text-tertiary)">{b.tools.noMcpServers}</div>
              ) : (
                <div className="grid gap-1.5">
                  <div
                    className="overflow-y-auto overscroll-contain"
                    style={{
                      maxHeight: 200
                    }}
                  >
                    <div className="grid gap-1">
                      {caps.mcp.map(m => {
                        const needsSetup =
                          m.fromCatalog &&
                          !m.installed &&
                          ((m.requires || []).length > 0 || (m.auth || '').toLowerCase() === 'oauth')

                        return (
                          <label className="flex items-start gap-2 text-xs text-(--ui-text-secondary)" key={m.name}>
                            <Checkbox
                              checked={!!m.enabled}
                              disabled={needsSetup}
                              onCheckedChange={value => toggleCap('mcp', m.name, Boolean(value))}
                            />
                            <span className="min-w-0">
                              <span>{m.name}</span>
                              {m.fromCatalog && !needsSetup ? (
                                <span className="ml-1.5 text-[0.65rem] text-(--ui-text-quaternary)">
                                  {m.installed ? 'catalog · installed' : 'catalog'}
                                </span>
                              ) : null}
                              {needsSetup ? (
                                <McpSetupButton
                                  ensureProfile={ensureAgentCreated}
                                  entry={m}
                                  onDone={() => {
                                    // Setup done: mark installed so the row's
                                    // checkbox un-disables, and enable it.
                                    setCaps(prev =>
                                      prev
                                        ? {
                                            ...prev,
                                            mcp: prev.mcp.map(x =>
                                              x.name === m.name
                                                ? {
                                                    ...x,
                                                    installed: true,
                                                    enabled: true
                                                  }
                                                : x
                                            )
                                          }
                                        : prev
                                    )
                                    setDirtyCaps(prev => ({
                                      ...prev,
                                      mcp: true
                                    }))
                                  }}
                                  profile={createdRef.current}
                                />
                              ) : null}
                              {m.description ? (
                                <div className="truncate text-[0.65rem] leading-4 text-(--ui-text-quaternary)">
                                  {m.description}
                                </div>
                              ) : null}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  <div className="text-[0.65rem] leading-4 text-(--ui-text-quaternary)">
                    Configured servers copy from the main profile; catalog entries are the bundled MCP menu. Entries
                    needing API keys route through setup first (credentials follow the shared keys setting).
                  </div>
                </div>
              )}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-md border border-(--ui-stroke-secondary) px-3 py-2 text-xs text-(--ui-accent)">
              {error}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={() => {
              discardDraft()
              reset()
              onClose()
            }}
            variant="ghost"
          >
            {t.common.cancel}
          </Button>
          <Button disabled={busy || !valid || taken} onClick={submit}>
            {busy ? 'Creating…' : 'Create Bot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


export { GroupDialog, CreateGroupChatDialog } from './group-dialogs'
export { singleFlight } from './single-flight'
