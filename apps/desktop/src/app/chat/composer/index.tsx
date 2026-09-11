import { ComposerPrimitive } from '@assistant-ui/react'
import { useStore } from '@nanostores/react'
import { type ClipboardEvent, type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef } from 'react'
import { useTourMarker } from '@/app/chat/tour-marker'
import { useHudComposerDrag } from '@/app/hud/composer-drag'
import { composerFill, composerFloatingStrip, composerSurfaceGlass } from '@/components/chat/composer-dock'
import { Button } from '@/components/ui/button'
import { Slot as ContribSlot } from '@/contrib/react/slot'
import { useI18n } from '@/i18n'
import { chatMessageText } from '@/lib/chat-messages'
import { PR_COMMENT_URL_RE } from '@/lib/chat-runtime'
import { sanitizeComposerInput } from '@/lib/composer-input-sanitize'
import { DATA_IMAGE_URL_RE } from '@/lib/embedded-images'
import { triggerHaptic } from '@/lib/haptics'
import { useStoresSelector } from '@/lib/use-session-slice'
import { cn } from '@/lib/utils'
import { interceptsTypedVoiceStop } from '@/lib/voice-stop-word'
import { sessionCompacting } from '@/store/compaction'
import { browseBackward, browseForward, deriveUserHistory, isBrowsingHistory } from '@/store/composer-input-history'
import { POPOUT_WIDTH_REM } from '@/store/composer-popout'
import { parkQueuedPrompts, removeQueuedPrompt, unparkQueuedPrompts } from '@/store/composer-queue'
import { $hudMode } from '@/store/hud'
import { sessionBlockingPrompt } from '@/store/prompts'
import { toggleReview } from '@/store/review'
import { $gatewayState } from '@/store/session'
import { $botChatSessionIds, $sessionStates, $sessionTiles, isBotChatSession } from '@/store/session-states'
import { $threadScrolledUp } from '@/store/thread-scroll'
import { $autoSpeakReplies } from '@/store/voice-prefs'
import { useTheme } from '@/themes'
import { AttachmentList } from './attachments'
import {
  acceptsTriggerCompletion,
  COMPOSER_FADE_BACKGROUND,
  implicitSlashAcceptIndex,
  type QueueEditState,
  shouldDisableComposerInput,
  slashArgStage
} from './composer-utils'
import { ContextMenu } from './context-menu'
import { COMPOSER_AREAS, runComposerMiddleware } from './contrib'
import { ComposerControls } from './controls'
import { ComposerDirectiveActions } from './directive-actions'
import { COMPOSER_DROP_ACTIVE_CLASS, COMPOSER_DROP_FADE_CLASS } from './drop-affordance'
import { markActiveComposer, onComposerAttachImagesRequest } from './focus'
import { HelpHint } from './help-hint'
import { useAtCompletions } from './hooks/use-at-completions'
import { useComposerBranch } from './hooks/use-composer-branch'
import { useComposerDraft } from './hooks/use-composer-draft'
import { useComposerDrop } from './hooks/use-composer-drop'
import { useComposerEscCancel } from './hooks/use-composer-esc-cancel'
import { useComposerMetrics } from './hooks/use-composer-metrics'
import { useComposerPlaceholder } from './hooks/use-composer-placeholder'
import { useComposerPopout } from './hooks/use-composer-popout'
import { useComposerQueue } from './hooks/use-composer-queue'
import { useComposerSubmit } from './hooks/use-composer-submit'
import { triggerKeyUpHandler, useComposerTrigger } from './hooks/use-composer-trigger'
import { useComposerUndo } from './hooks/use-composer-undo'
import { useComposerUrlDialog } from './hooks/use-composer-url-dialog'
import { useComposerVoice } from './hooks/use-composer-voice'
import { useEmojiCompletions } from './hooks/use-emoji-completions'
import { useComposerMicroActions } from './hooks/use-micro-actions'
import { useSlashCompletions } from './hooks/use-slash-completions'
import { useSessionStatusPresence } from './hooks/use-status-presence'
import { ActionBadges } from './micro-actions'
import { chipTypedPathOnSpace, pathifyRefs } from './path-refs'
import { QueuePanel } from './queue-panel'
import {
  beginComposerComposition,
  composerPlainText,
  deleteChipBeforeCaret,
  deleteSelectionInEditor,
  insertComposerContentsAtCaret,
  normalizeComposerEditorDom,
  RICH_INPUT_SLOT
} from './rich-editor'
import { useComposerScope } from './scope'
import { ComposerStatusStack } from './status-stack'
import { CodingStatusRow } from './status-stack/coding-row'
import { SuggestionPills } from './suggestion-pills'
import { extractClipboardImageBlobs, openDirectiveScope } from './text-utils'
import { ComposerTriggerPopover } from './trigger-popover'
import type { ChatBarProps } from './types'
import { isRedoShortcut, isUndoShortcut } from './undo-history'
import { UrlDialog } from './url-dialog'
import { chipTypedUrlOnSpace, linkifyUrls } from './url-refs'
import { VoiceActivity, VoicePlaybackActivity } from './voice-activity'

export { ChatBar } from './chat-bar'
export function ChatBarFallback() {
  return (
    <div
      className={cn(
        'group/composer absolute bottom-0 left-1/2 z-30 w-[min(var(--composer-width),calc(100%-2rem))] max-w-full -translate-x-1/2 rounded-2xl pt-2 pb-[var(--composer-shell-pad-block-end)]',
        'bg-linear-to-b from-transparent to-background/55'
      )}
      data-slot="composer-root"
    >
      <div className="composer-fallback-surface relative isolate h-(--composer-fallback-height) w-full rounded-[inherit] border border-[color-mix(in_srgb,var(--dt-composer-ring)_calc(18%*var(--composer-ring-strength)),var(--dt-input))]">
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 -z-10 rounded-[inherit]',
            composerFill,
            composerSurfaceGlass
          )}
        />
      </div>
    </div>
  )
}
