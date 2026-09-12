/**
 * The neutral window-host contract for the HUD — the compact Session surface.
 *
 * The HUD owns presentation and window MECHANICS (click-through, frost, drag,
 * resize, edge parking); everything those mechanics need from the OS window
 * arrives through this port, and the surface's session coordination (which
 * conversation it shows, what the main window lands on when it closes) lives in
 * `application/session/window-handoff.ts`. No file in this directory names the
 * shell's API; composition assembles the implementation (see
 * `app/composition/bridges/window-ports.ts`).
 */

/** Platform windowing facts that shape the mechanics (which gestures can work). */
export interface HudWindowPlacement {
  clientPlacement: boolean
  controlDrag: boolean
  nativeDrag: boolean
  solid: boolean
  workspaceTransfer: boolean
}

export interface HudWindowPoint {
  x: number
  y: number
}

export interface HudWindowBounds {
  height: number
  width: number
  x: number
  y: number
}

export interface HudWindowPort {
  /** Make the window pass clicks through (or catch them) — the click-through mechanic. */
  setIgnoreMouse(ignore: boolean): void
  /** Cursor position feed for platforms where ignored windows stop receiving mousemove. */
  onCursor(callback: (point: HudWindowPoint | null) => void): () => void
  /** Native frost behind the band (a window-level material, not CSS). */
  setFrost(showing: boolean): void | Promise<unknown>
  /** Programmatic resize (the window is created non-resizable). */
  setBounds(bounds: HudWindowBounds): void
  /** Native window-move bracket (main samples the cursor between the calls). */
  beginMove(): void
  endMove(): void
  /** Park the window, pinning its size to the given snapshot. */
  moveBy(size: { width: number; height: number }): void
  /** X11/KWin only: keep the grabbed window visible across virtual-desktop changes. */
  setWorkspaceTransfer?(transferring: boolean): void
  /** Whether a fullscreen app (a game) is under the HUD. */
  onGameOverlay(callback: (state: { active: boolean }) => void): () => void
  /** Follow a retarget: switch the conversation this surface is showing. */
  onRetarget(callback: (sessionId: string) => void): () => void
  /** Keep the host told which session this surface is on. */
  reportSession(sessionId: null | string): void
  /** Absent when the shell provides no windowing facts (the mechanics degrade). */
  readonly placement?: HudWindowPlacement
}
