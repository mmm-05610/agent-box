// The create-dialogs surface: roster-pane-dialogs.tsx and the SDK import the
// agent, group, and group-settings dialogs from here.
//
// The dialogs live in their own modules — this file only composes them, so
// nothing it re-exports has to import back into it. The agent dialog's props,
// name rule, and capability catalog stay with that dialog.
export {
  type CapabilityCatalog,
  CreateAgentDialog,
  type CreateAgentDialogProps,
  NAME_RE
} from './create-agent-dialog'
export { CreateGroupChatDialog, GroupDialog } from './group-dialogs'
export { singleFlight } from './single-flight'
