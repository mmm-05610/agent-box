import type {
  CapabilityEntry
} from './profile-config'
import type { RosterRow } from './types'

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
