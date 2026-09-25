declare module '*.css'

interface DesktopWindowApi {
  minimize(): Promise<void>
  toggleMaximize(): Promise<boolean>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  onChromeState(listener: (maximized: boolean) => void): () => void
}

declare interface Window {
  desktopWindow?: DesktopWindowApi
}
