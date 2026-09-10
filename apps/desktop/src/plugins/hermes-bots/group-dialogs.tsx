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
import { $botMeta, botHandle, botRosterKey, filterBots, ROSTER_KEY, saveBotMeta } from './data'
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
import { botRosterMeta } from './routing'
import type { BotMeta, ConnectionRow, RosterRow } from './types'

/** Group chat creation dialogs (rename a bot chat into a group). */

interface GroupDialogProps {
  bot: RosterRow
  onClose: () => void
}

/** Assign a bot to a group-chat membership without replacing its others.
 *  Existing groups are independent toggles; the input creates and joins a new
 *  one. Canonical groups + the legacy scalar projection ride ui_meta. */
export function GroupDialog({ bot, onClose }: GroupDialogProps) {
  const b = useBots()
  const meta = useValue($botMeta)
  const [name, setName] = useState('')
  const current = botGroups(botRosterMeta(bot, meta))
  const groups = knownGroups(meta)

  const setMembership = (group: string, enabled: boolean) => {
    void saveBotMeta(bot, groupMembershipPatch(botRosterMeta(bot, meta), group, enabled))
    host.notify({
      kind: 'info',
      message: enabled
        ? `${displayName(bot, botRosterMeta(bot, meta))} added to “${group}”`
        : `${displayName(bot, botRosterMeta(bot, meta))} removed from “${group}”`
    })
  }

  return (
    <Dialog
      onOpenChange={value => {
        if (!value) {
          onClose()
        }
      }}
      open={Boolean(bot)}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{b.group.manageTitle}</DialogTitle>
          <DialogDescription>{b.group.manageDesc}</DialogDescription>
        </DialogHeader>
        {groups.length ? (
          <div className="grid gap-1.5">
            {groups.map(group => {
              const enabled = current.includes(group)

              return (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-(--chrome-action-hover)"
                  key={group}
                >
                  <Checkbox checked={enabled} onCheckedChange={checked => setMembership(group, checked === true)} />
                  <span>{group}</span>
                </label>
              )
            })}
          </div>
        ) : null}
        <form
          className="flex items-center gap-1.5"
          onSubmit={event => {
            event.preventDefault()
            const trimmed = name.trim()

            if (trimmed) {
              setMembership(trimmed, true)
              setName('')
            }
          }}
        >
          <Input
            autoFocus
            onChange={event => setName(event.target.value)}
            placeholder={groups.length ? 'New group…' : 'Group name (e.g. Research)'}
            value={name}
          />
          <Button disabled={!name.trim()} size="sm" type="submit">
            Create & join
          </Button>
        </form>
        {current.length ? (
          <Button
            className="justify-self-start"
            onClick={() =>
              void saveBotMeta(bot, {
                groups: [],
                group: null
              })
            }
            size="sm"
            variant="ghost"
          >
            {b.bot.removeFromAllGroups}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

interface CreateGroupChatDialogProps {
  onClose: () => void
  onCreated?: (group: string) => void
  open: boolean
  roster: RosterRow[]
}

/** Discord-style group chat creation: pick 2+ bots via checkboxes (with
 *  search), name the group, create. Assignment appends to each local bot's
 *  group membership list, so the room appears in the roster and syncs
 *  cross-machine via ui_meta without replacing its other groups. */
export function CreateGroupChatDialog({ open, roster, onClose, onCreated }: CreateGroupChatDialogProps) {
  const { t } = useI18n()
  const b = useBots()
  const allMeta: Record<string, BotMeta> = useValue($botMeta)
  const [query, setQuery] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [name, setName] = useState('')
  const [image, setImage] = useState<null | string>(null)

  // Reset per open so a cancelled draft doesn't leak into the next one.
  useEffect(() => {
    if (open) {
      setQuery('')
      setChecked({})
      setName('')
      setImage(null)
    }
  }, [open])

  // An outage placeholder preserves one selected owner's identity in the
  // sidebar, but it is not a routable room member. Never offer it here.
  const selectableRoster = roster.filter(bot => !bot?.ghost)
  const selected = selectableRoster.filter(bot => checked[botRosterKey(bot)])
  const visible: RosterRow[] = filterBots(selectableRoster, allMeta, query)
  const atCap = selected.length >= GROUP_CHAT_MAX_MEMBERS

  const placeholder = selected.length
    ? selected.map(bot => displayName(bot, botRosterMeta(bot, allMeta))).join(', ')
    : b.group.nameLabel

  const canCreate = selected.length >= 2 && Boolean(name.trim() || selected.length)

  const create = () => {
    const base = (name.trim() || placeholder).slice(0, 64)

    if (selected.length < 2 || !base) {
      return
    }

    // Creating a group is always a FRESH room. Without this, re-creating a
    // group under an existing name (easy — the default name is just the
    // member names) silently reopens the old room with its full log, which
    // reads as "not a fresh group" (db's Aug 2026 report). Uniquify against
    // both live rooms and any bot's current grouping, then mint a fresh
    // roomId: member sessions are titled by that roomId, so a
    // disbanded-and-recreated group with the SAME display name still gets
    // new sessions instead of resuming the old room's by title.
    const taken = new Set(liveGroupChatNames())

    for (const meta of Object.values($botMeta.get() || {})) {
      for (const existing of botGroups(meta)) {
        taken.add(existing)
      }
    }

    const groupName = uniqueGroupChatName(base, taken)
    const roomId = mintGroupRoomId()

    for (const bot of selected) {
      void saveBotMeta(bot, groupMembershipPatch(botRosterMeta(bot, allMeta), groupName, true))
    }

    // Persist every machine identity, including today's active source. That
    // member becomes remote after a source switch and cannot rely on the new
    // gateway's name-keyed bot metadata to remain seated in this room.
    const roomMembers = durableGroupChatMembers(selected)
    updateGroupChat(groupName, (room: GroupChatRoom) => {
      room.members = roomMembers
      room.roomId = roomId

      if (image) {
        room.image = image
      }

      return room
    })
    host.notify({
      kind: 'info',
      message: `“${groupName}” created with ${selected.length} bots`
    })
    onClose()
    onCreated?.(groupName)
  }

  return (
    <Dialog
      onOpenChange={value => {
        if (!value) {
          onClose()
        }
      }}
      open={open}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{b.group.newTitle}</DialogTitle>
          <DialogDescription>{`Pick 2–${GROUP_CHAT_MAX_MEMBERS} bots. Local memberships sync through each Bot profile; cross-machine members stay scoped to this room.`}</DialogDescription>
        </DialogHeader>
        {/* TODO(bot-mode-types): this search box never takes focus when the dialog
            opens — SearchField accepts no `autoFocus` prop and forwards no extra
            props, so the `autoFocus` that used to sit here was inert. */}
        <SearchField
          aria-label={b.group.searchToAdd}
          containerClassName="w-full"
          inputClassName="w-full"
          onChange={setQuery}
          placeholder={b.group.searchToAddPlaceholder}
          value={query}
        />
        {selected.length ? (
          <div className="flex flex-wrap gap-1">
            {selected.map(bot => (
              <Badge
                asChild
                className="rounded-full bg-(--chrome-action-hover) pl-2 pr-1.5 text-[0.6875rem] text-(--ui-text-secondary) transition-colors hover:text-foreground"
                key={botRosterKey(bot)}
                variant="muted"
              >
                <RowButton
                  onClick={() =>
                    setChecked(prev => ({
                      ...prev,
                      [botRosterKey(bot)]: false
                    }))
                  }
                  title={b.group.removeFromSelection}
                >
                  {displayName(bot, botRosterMeta(bot, allMeta))}
                  <Codicon className="text-[0.6rem]" name="close" />
                </RowButton>
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="max-h-64 min-h-0 overflow-y-auto overscroll-contain">
          <div className="grid gap-0.5 pr-2">
            {visible.length ? (
              visible.map(bot => {
                const meta = botRosterMeta(bot, allMeta)
                const { shape, color, image } = botAppearance(bot.name, meta)
                const isChecked = Boolean(checked[botRosterKey(bot)])
                const disabled = !isChecked && atCap
                const currentGroups = botGroups(meta)

                return (
                  <label
                    className={cn(
                      'flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-(--chrome-action-hover)',
                      disabled && 'cursor-not-allowed opacity-50'
                    )}
                    key={botRosterKey(bot)}
                  >
                    <BotFace
                      color={avatarColor(color, bot.name)}
                      image={image && !isBackfilledFacePng(image) ? image : null}
                      name={bot.name}
                      shape={shape}
                      size={24}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-foreground">{displayName(bot, meta)}</div>
                      <div className="truncate text-[0.625rem] text-(--ui-text-quaternary)">
                        {[
                          currentGroups.length
                            ? `@${botHandle(bot.name, bot)} · in ${currentGroups.map(group => `“${group}”`).join(', ')}`
                            : `@${botHandle(bot.name, bot)}`,
                          bot.remoteSource && bot.connectionLabel ? ` · ${bot.connectionLabel}` : ''
                        ].join('')}
                      </div>
                    </div>
                    <Checkbox
                      checked={isChecked}
                      disabled={disabled}
                      onCheckedChange={value =>
                        setChecked(prev => ({
                          ...prev,
                          [botRosterKey(bot)]: Boolean(value)
                        }))
                      }
                    />
                  </label>
                )
              })
            ) : (
              <div className="px-1.5 py-3 text-center text-xs text-(--ui-text-tertiary)">
                {query.trim() ? `No bots match “${query.trim()}”` : 'No bots yet — create one first.'}
              </div>
            )}
          </div>
        </div>
        <div className="grid gap-2">
          <GroupImageControls
            image={image}
            onImage={setImage}
            seedMembers={selected.map(bot => displayName(bot, botRosterMeta(bot, allMeta)))}
            seedName={name.trim() || (selected.length ? placeholder : '')}
          />
          <form
            onSubmit={event => {
              event.preventDefault()
              create()
            }}
          >
            <Input
              aria-label={b.group.nameLabel}
              maxLength={64}
              onChange={event => setName(event.target.value)}
              placeholder={placeholder}
              value={name}
            />
          </form>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="secondary">
            {t.common.cancel}
          </Button>
          <Button
            disabled={!canCreate}
            onClick={create}
            title={selected.length < 2 ? 'Pick at least 2 bots' : undefined}
          >{`Create Group${selected.length ? ` (${selected.length})` : ''}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

