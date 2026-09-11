import {
  Button,
  Checkbox,
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
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useI18n
} from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { avatarColor, blobatarSvg, BotFace } from './avatar'
import { AvatarPicker } from './avatar-picker'
import { $selectedBot } from './bot-state'
import { createCanonicalChat } from './canonical-chat'
import { ROSTER_KEY, saveBotMeta } from './data'
import { labeled, ResizableFrame } from './dialog-parts'
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
import { singleFlight } from './single-flight'
import { HubSkillsSection } from './skills-hub'
import { composeSoul } from './soul'
import type { ConnectionRow, RosterRow } from './types'

export { CreateAgentDialog } from './create-agent-dialog'
export const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
export interface CapabilityCatalog {
  mcp: CapabilityEntry[]
  skills: CapabilityEntry[]
  source: string
  toolsets: CapabilityEntry[]
}
export interface CreateAgentDialogProps {
  onClose: () => void
  open: boolean
  roster: RosterRow[]
}
export { CreateGroupChatDialog, GroupDialog } from './group-dialogs'
export { singleFlight } from './single-flight'
