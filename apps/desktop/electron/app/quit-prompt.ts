/**
 * app/quit-prompt.ts
 *
 * "You have work running — quit anyway?" and the way it must NOT become a quit
 * the app cannot perform.
 *
 * Extracted from `main.ts` (E5c). It owns exactly one piece of state: whether a
 * prompt is already open, so a second `before-quit` (Electron re-enters the event
 * after a prevented quit) does not stack dialogs. The confirmed flag lives here
 * too, because only this module can know that an "ok, quit anyway" answered the
 * question the prompt asked.
 *
 * The `catch` is load-bearing: a dialog that cannot be shown must not leave the
 * app refusing to exit.
 */

import { app, BrowserWindow, dialog } from 'electron'

import { mergeActiveWork, quitPromptFor } from './quit-guard'

export interface QuitPromptDeps {
  /** The live active-work reports, read at prompt time so the answer is current. */
  activeWorkByWebContents: Map<number, unknown>
  /** True while a hand-off updater owns the exit path. */
  getIsQuittingForHandoff: () => boolean
  /** `HERMES_DESKTOP_SKIP_QUIT_CONFIRM=1`: never prompt (automation, smoke runs). */
  skipQuitConfirm: boolean
}

export interface QuitPrompt {
  /** Returns true when the quit was held back for the dialog. */
  held(event: { preventDefault: () => void }): boolean
}

export function createQuitPrompt(deps: QuitPromptDeps): QuitPrompt {
  let promptOpen = false
  let confirmed = false

  return {
    held(event) {
      if (deps.skipQuitConfirm || confirmed || promptOpen) {
        return false
      }

      const prompt = quitPromptFor(
        mergeActiveWork(deps.activeWorkByWebContents.values() as any),
        deps.getIsQuittingForHandoff()
      )

      const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

      if (!prompt || !parent || parent.isDestroyed()) {
        return false
      }

      event.preventDefault()
      promptOpen = true

      void dialog
        .showMessageBox(parent, {
          buttons: ['Keep Running', 'Quit Anyway'],
          cancelId: 0,
          defaultId: 0,
          detail: prompt.detail,
          message: prompt.message,
          type: 'question'
        })
        .then(({ response }) => {
          promptOpen = false

          if (response === 1) {
            confirmed = true
            app.quit()
          }
        })
        .catch(() => {
          // A dialog we can't show must not become a quit we can't perform.
          promptOpen = false
          confirmed = true
          app.quit()
        })

      return true
    }
  }
}
