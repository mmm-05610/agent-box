"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { getSystemTerminalSettings, terminalKill } from "@/lib/api"
import { getTransport } from "@/core/transport"
import { randomUUID } from "@/lib/utils"
import { useActiveFolder } from "@/contexts/active-folder-context"
import { useShortcutSettings } from "@/hooks/use-shortcut-settings"
import { matchShortcutEvent } from "@/lib/keyboard-shortcuts"

export interface TerminalTab {
  id: string
  folderId: number
  title: string
  workingDir: string
  shell?: string
  initialCommand?: string
}

const DEFAULT_HEIGHT = 300
const MIN_HEIGHT = 150
const MAX_HEIGHT = 600
const TERMINAL_SETTINGS_UPDATED_EVENT = "app://terminal-settings-updated"

interface TerminalContextValue {
  isOpen: boolean
  height: number
  minHeight: number
  maxHeight: number
  toggle: () => void
  setHeight: (h: number) => void
  tabs: TerminalTab[]
  activeTabId: string | null
  exitedTerminals: Set<string>
  markTerminalExited: (id: string) => void
  createTerminal: () => Promise<void>
  createTerminalInDirectory: (
    workingDir: string,
    title?: string,
    shell?: string
  ) => Promise<string | null>
  createTerminalWithCommand: (
    title: string,
    command: string
  ) => Promise<string | null>
  closeTerminal: (id: string) => void
  closeOtherTerminals: (id: string) => void
  closeAllTerminals: () => void
  renameTerminal: (id: string, title: string) => void
  switchTerminal: (id: string) => void
}

const TerminalContext = createContext<TerminalContextValue | null>(null)

export function useTerminalContext() {
  const ctx = useContext(TerminalContext)
  if (!ctx) {
    throw new Error("useTerminalContext must be used within TerminalProvider")
  }
  return ctx
}

export function TerminalProvider({ children }: { children: ReactNode }) {
  const { activeFolder, activeFolderId } = useActiveFolder()
  const { shortcuts } = useShortcutSettings()
  const [isOpen, setIsOpen] = useState(false)
  const [height, setHeightState] = useState(DEFAULT_HEIGHT)
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const tabCounterRef = useRef(0)
  const [exitedTerminals, setExitedTerminals] = useState<Set<string>>(new Set())
  const [defaultTerminalShell, setDefaultTerminalShell] = useState<
    string | null
  >(null)
  const lastMouseActivityInTerminalRef = useRef(false)
  // Keep a ref of tabs for cleanup on unmount (effect [] captures stale state)
  const tabsRef = useRef(tabs)
  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  const folderPath = activeFolder?.path ?? ""
  const currentFolderId = activeFolderId ?? 0
  const resolveTerminalShell = useCallback(
    (shell?: string) => shell ?? defaultTerminalShell ?? undefined,
    [defaultTerminalShell]
  )

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined

    getSystemTerminalSettings()
      .then((settings) => {
        if (!cancelled) setDefaultTerminalShell(settings.default_shell)
      })
      .catch((err) => {
        console.error("[terminal] load terminal settings failed:", err)
      })

    getTransport()
      .subscribe<{ default_shell: string | null }>(
        TERMINAL_SETTINGS_UPDATED_EVENT,
        (settings) => {
          setDefaultTerminalShell(settings.default_shell)
        }
      )
      .then((dispose) => {
        if (cancelled) {
          dispose()
          return
        }
        unlisten = dispose
      })
      .catch((err) => {
        console.error("[terminal] subscribe terminal settings failed:", err)
      })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  const markTerminalExited = useCallback((id: string) => {
    setExitedTerminals((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const removeExitedTerminals = useCallback((ids: string[]) => {
    setExitedTerminals((prev) => {
      if (prev.size === 0) return prev
      let changed = false
      const next = new Set(prev)
      for (const id of ids) {
        if (next.delete(id)) changed = true
      }
      return changed ? next : prev
    })
  }, [])

  const killTerminalTabs = useCallback((targetTabs: TerminalTab[]) => {
    targetTabs.forEach((tab) => {
      terminalKill(tab.id).catch(() => {})
    })
  }, [])

  const toggle = useCallback(() => {
    const autoId = randomUUID()
    const nextCounter = tabCounterRef.current + 1

    setIsOpen((wasOpen) => !wasOpen)

    // Auto-create first terminal when opening with no tabs
    setTabs((currentTabs) => {
      if (currentTabs.length > 0 || !folderPath) return currentTabs
      tabCounterRef.current = nextCounter
      return [
        {
          id: autoId,
          folderId: currentFolderId,
          title: `Terminal ${nextCounter}`,
          workingDir: folderPath,
          shell: resolveTerminalShell(),
        },
      ]
    })

    setActiveTabId((prev) => {
      if (prev !== null) return prev
      if (!folderPath) return null
      return autoId
    })
  }, [folderPath, currentFolderId, resolveTerminalShell])

  const createTerminalWithCommand = useCallback(
    async (title: string, command: string) => {
      if (!folderPath) return null

      setIsOpen(true)

      const id = randomUUID()
      tabCounterRef.current += 1
      setTabs((prev) => [
        ...prev,
        {
          id,
          folderId: currentFolderId,
          title,
          workingDir: folderPath,
          shell: resolveTerminalShell(),
          initialCommand: command,
        },
      ])
      setActiveTabId(id)

      return id
    },
    [folderPath, currentFolderId, resolveTerminalShell]
  )

  const createTerminalInDirectory = useCallback(
    async (workingDir: string, title?: string, shell?: string) => {
      if (!workingDir) return null

      setIsOpen(true)

      const id = randomUUID()
      tabCounterRef.current += 1
      const defaultTitle = `Terminal ${tabCounterRef.current}`
      setTabs((prev) => [
        ...prev,
        {
          id,
          folderId: currentFolderId,
          title: title ?? defaultTitle,
          workingDir,
          shell: resolveTerminalShell(shell),
        },
      ])
      setActiveTabId(id)

      return id
    },
    [currentFolderId, resolveTerminalShell]
  )

  const createTerminal = useCallback(async () => {
    if (!folderPath) return
    await createTerminalInDirectory(folderPath)
  }, [folderPath, createTerminalInDirectory])

  const setHeight = useCallback((h: number) => {
    setHeightState(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, h)))
  }, [])

  const closeTerminal = useCallback(
    (id: string) => {
      markTerminalExited(id)
      removeExitedTerminals([id])
      terminalKill(id).catch(() => {})
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id)
        if (next.length === 0) {
          tabCounterRef.current = 0
          setIsOpen(false)
          setActiveTabId(null)
        } else {
          setActiveTabId((prevActive) =>
            prevActive === id ? next[next.length - 1].id : prevActive
          )
        }
        return next
      })
    },
    [markTerminalExited, removeExitedTerminals]
  )

  const closeOtherTerminals = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const closed = prev.filter((t) => t.id !== id)
        killTerminalTabs(closed)
        removeExitedTerminals(closed.map((t) => t.id))
        return prev.filter((t) => t.id === id)
      })
      setActiveTabId(id)
    },
    [killTerminalTabs, removeExitedTerminals]
  )

  const closeAllTerminals = useCallback(() => {
    setTabs((prev) => {
      killTerminalTabs(prev)
      removeExitedTerminals(prev.map((t) => t.id))
      return []
    })
    tabCounterRef.current = 0
    setActiveTabId(null)
    setIsOpen(false)
  }, [killTerminalTabs, removeExitedTerminals])

  const renameTerminal = useCallback((id: string, title: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)))
  }, [])

  const switchTerminal = useCallback((id: string) => {
    setActiveTabId(id)
  }, [])

  const isInTerminalRegion = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return false
    return Boolean(target.closest('[data-terminal-panel-region="true"]'))
  }, [])

  const updateLastMouseActivity = useCallback(
    (target: EventTarget | null) => {
      const next = isInTerminalRegion(target)
      if (lastMouseActivityInTerminalRef.current === next) return
      lastMouseActivityInTerminalRef.current = next
    },
    [isInTerminalRegion]
  )

  useEffect(() => {
    const handlePointerActivity = (event: PointerEvent) => {
      updateLastMouseActivity(event.target)
    }
    const handleFocusActivity = (event: FocusEvent) => {
      updateLastMouseActivity(event.target)
    }

    window.addEventListener("pointerover", handlePointerActivity, true)
    window.addEventListener("pointerdown", handlePointerActivity, true)
    window.addEventListener("focusin", handleFocusActivity, true)
    return () => {
      window.removeEventListener("pointerover", handlePointerActivity, true)
      window.removeEventListener("pointerdown", handlePointerActivity, true)
      window.removeEventListener("focusin", handleFocusActivity, true)
    }
  }, [updateLastMouseActivity])

  useEffect(() => {
    if (!isOpen) {
      lastMouseActivityInTerminalRef.current = false
    }
  }, [isOpen])

  useEffect(() => {
    const handleTerminalHotkeys = (event: KeyboardEvent) => {
      if (!isOpen) return

      const targetInTerminal = isInTerminalRegion(event.target)
      const activeElementInTerminal = isInTerminalRegion(document.activeElement)
      const shouldHandle =
        lastMouseActivityInTerminalRef.current ||
        targetInTerminal ||
        activeElementInTerminal
      if (!shouldHandle) return

      if (matchShortcutEvent(event, shortcuts.new_terminal_tab)) {
        event.preventDefault()
        event.stopPropagation()
        void createTerminal()
        return
      }

      if (
        activeTabId &&
        matchShortcutEvent(event, shortcuts.close_current_terminal_tab)
      ) {
        event.preventDefault()
        event.stopPropagation()
        closeTerminal(activeTabId)
      }
    }

    window.addEventListener("keydown", handleTerminalHotkeys, true)
    return () => {
      window.removeEventListener("keydown", handleTerminalHotkeys, true)
    }
  }, [
    activeTabId,
    closeTerminal,
    createTerminal,
    isInTerminalRegion,
    isOpen,
    shortcuts.close_current_terminal_tab,
    shortcuts.new_terminal_tab,
  ])

  // Cleanup all terminals on unmount — uses ref to get current tabs
  useEffect(() => {
    return () => {
      tabsRef.current.forEach((t) => {
        terminalKill(t.id).catch(() => {})
      })
    }
  }, [])

  const value = useMemo(
    () => ({
      isOpen,
      height,
      minHeight: MIN_HEIGHT,
      maxHeight: MAX_HEIGHT,
      toggle,
      setHeight,
      tabs,
      activeTabId,
      exitedTerminals,
      markTerminalExited,
      createTerminal,
      createTerminalInDirectory,
      createTerminalWithCommand,
      closeTerminal,
      closeOtherTerminals,
      closeAllTerminals,
      renameTerminal,
      switchTerminal,
    }),
    [
      isOpen,
      height,
      toggle,
      setHeight,
      tabs,
      activeTabId,
      exitedTerminals,
      markTerminalExited,
      createTerminal,
      createTerminalInDirectory,
      createTerminalWithCommand,
      closeTerminal,
      closeOtherTerminals,
      closeAllTerminals,
      renameTerminal,
      switchTerminal,
    ]
  )

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  )
}
