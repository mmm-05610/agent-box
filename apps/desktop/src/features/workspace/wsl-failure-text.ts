/**
 * features/workspace/wsl-failure-text.ts — localized copy per typed host
 * error code, shared by the wizard and the sidebar section. The host's raw
 * message never reaches the UI.
 */

import type { useI18n } from '@/i18n'
import type { WslWorkspaceErrorCode } from '@/types/workspace'

export function wslFailureText(t: ReturnType<typeof useI18n>['t'], code: WslWorkspaceErrorCode | null): string {
  const w = t.wslWorkspace

  switch (code) {
    case 'WSL_UNAVAILABLE':
      return w.errWslUnavailable

    case 'WSL_UNKNOWN_DISTRIBUTION':
      return w.errWslUnknownDistribution

    case 'WSL_USER_NOT_FOUND':
      return w.errWslUserNotFound

    case 'WSL_CONNECT_TIMEOUT':
      return w.errWslConnectTimeout

    case 'WSL_CONNECT_FAILED':
      return w.errWslConnectFailed

    case 'WSL_CANCELLED':
      return w.errWslCancelled

    case 'WSL_CONNECTION_EXPIRED':
      return w.errWslConnectionExpired

    case 'WSL_INVALID_PATH':
      return w.errWslInvalidPath

    case 'WSL_DIRECTORY_NOT_FOUND':
      return w.errWslDirectoryNotFound

    case 'WSL_DIRECTORY_NO_PERMISSION':
      return w.errWslDirectoryNoPermission

    case 'WSL_LIST_FAILED':
      return w.errWslListFailed

    case 'WSL_LIST_OVERFLOW':
      return w.errWslListOverflow

    case 'WSL_SAVE_FAILED':
      return w.errWslSaveFailed

    case 'WSL_NOT_FOUND':
      return w.errWslNotFound

    case 'WSL_STORE_FUTURE_VERSION':
      return w.errWslStoreFutureVersion

    case 'WSL_STORE_ILLEGAL_VERSION':
      return w.errWslStoreIllegalVersion

    default:
      return w.errUnexpected
  }
}
