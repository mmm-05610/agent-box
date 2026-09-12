import type { ComponentProps, ReactNode } from 'react'

import type { ChatView } from '@/features/chat'
import type { ChatSidebar } from '@/features/chat/sidebar'
import type { CommandCenterSection } from '@/features/command-center'
import type { ModelMenuPanel } from '@/features/profiles/model-menu-panel'
import type { GatewayRequester } from '@/types/gateway'

export type { GatewayRequester }

/** The ChatSidebar handlers the controller owns — forwarded verbatim. */
export type SidebarActions = Pick<
  ComponentProps<typeof ChatSidebar>,
  | 'onArchiveSession'
  | 'onBranchSession'
  | 'onDeleteSession'
  | 'onLoadMoreSessions'
  | 'onManageCronJob'
  | 'onNavigate'
  | 'onNewSessionInWorkspace'
  | 'onNewSessionSplit'
  | 'onResumeSession'
  | 'onTriggerCronJob'
>

/** The ChatView handlers the controller owns — forwarded verbatim. */
export type ChatActions = Pick<
  ComponentProps<typeof ChatView>,
  | 'onAddContextRef'
  | 'onAddUrl'
  | 'onAttachDroppedItems'
  | 'onAttachImageBlob'
  | 'onAttachPrCommentUrl'
  | 'onBranchInNewChat'
  | 'onCancel'
  | 'onDeleteSelectedSession'
  | 'onDismissError'
  | 'onEdit'
  | 'onPasteClipboardImage'
  | 'onPickFiles'
  | 'onPickFolders'
  | 'onPickImages'
  | 'onReload'
  | 'onRemoveAttachment'
  | 'onRestoreToMessage'
  | 'onRetryResume'
  | 'onSteer'
  | 'onSubmit'
  | 'onThreadMessagesChange'
  | 'onToggleSelectedPin'
  | 'onTranscribeAudio'
>

/**
 * The complete controller-owned callback surface. One object, one stable
 * identity for the app's life — its fields are mutated in place each render,
 * so surfaces bound to it never re-render on identity churn but always invoke
 * the latest closure.
 */
export interface WiringActions extends SidebarActions, ChatActions {
  /** Imperative access to the live gateway for controller-owned callbacks.
   *  Rendered surfaces subscribe to the active `$gateway` atom directly. */
  getGateway: () => ComponentProps<typeof ChatView>['gateway']
  openAgents: () => void
  openCommandCenterSection: (section: CommandCenterSection) => void
  requestGateway: GatewayRequester
  selectModel: ComponentProps<typeof ModelMenuPanel>['onSelectModel']
  toggleCommandCenter: () => void
}

/** The four wired surfaces the controller publishes; `WiredPane` renders one by
 *  key inside a registered pane / chrome slot. */
export interface WiringApi {
  sidebar: ReactNode
  chatRoutes: ReactNode
  terminal: ReactNode
  statusbar: ReactNode
}
