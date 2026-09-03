import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Ref } from "react"

import { Sidebar } from "./sidebar"
// Type-only (erased at runtime, so it does not defeat the mock below): pins the
// stub's imperative handle to the real component's contract.
import type { SidebarConversationListHandle } from "@/features/projects/components/sidebar-conversation-list"
import enMessages from "@/i18n/messages/en.json"

// Stable spies + mutable active-folder, referenced from the hoisted mock
// factories below (vi.mock is hoisted above imports).
const spies = vi.hoisted(() => ({
  openNewConversationTab: vi.fn(),
  openChatModeTab: vi.fn(),
  setRoute: vi.fn(),
  openConversations: vi.fn(),
  // Search dialog (ZCode layout moved the Search row back into the sidebar).
  setSearchOpen: vi.fn(),
  // Bottom account row's settings gear.
  openSettingsWindow: vi.fn(),
  // "Groups" pill placeholder toast.
  toastInfo: vi.fn(),
  // The list's imperative handle, driven by the header buttons.
  scrollToActive: vi.fn(),
  expandAll: vi.fn(),
  collapseAll: vi.fn(),
  // Latest props the (stubbed) conversation list was rendered with, so tests can
  // assert what the sidebar threads down (e.g. showCompleted / sortMode).
  listProps: null as {
    showCompleted?: boolean
    sortMode?: string
  } | null,
}))
const mockState = vi.hoisted(() => ({
  activeFolder: { id: 7, path: "/x" } as { id: number; path: string } | null,
}))

// The conversation list is irrelevant here — stub it so the test exercises only
// the sidebar's header + fixed nav region. The stub still fulfils the imperative
// handle (React 19 hands `ref` to a function component as a plain prop, which is
// how the real component takes it), so the header buttons that drive the list
// are asserted against real calls instead of clicking into a null ref.
vi.mock(
  "@/features/projects/components/sidebar-conversation-list",
  async () => {
    const { useImperativeHandle } = await import("react")
    return {
      SidebarConversationList: ({
        ref,
        ...props
      }: {
        ref?: Ref<SidebarConversationListHandle>
        showCompleted?: boolean
        sortMode?: string
      }) => {
        spies.listProps = props
        useImperativeHandle(ref, () => ({
          scrollToActive: spies.scrollToActive,
          expandAll: spies.expandAll,
          collapseAll: spies.collapseAll,
        }))
        return null
      },
    }
  }
)
vi.mock("@/features/shell", () => ({
  useSidebar: () => ({ isOpen: true, toggle: vi.fn() }),
  useSearchDialog: () => ({ open: false, setOpen: spies.setSearchOpen }),
  useAutomationsView: () => ({
    automations: [],
    unseenFailures: 0,
    refetch: async () => {},
  }),
  useTasksView: () => ({
    tasks: [],
    attentionCount: 0,
    refetch: async () => {},
  }),
  useWorkbenchRoute: () => ({
    routeId: "conversations",
    isConversations: true,
    setRoute: spies.setRoute,
    openConversations: spies.openConversations,
  }),
}))
// The settings gear calls the real api client's openSettingsWindow; keep every
// other export intact (project-tree's dialogs import this module transitively).
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  openSettingsWindow: spies.openSettingsWindow,
}))
vi.mock("sonner", () => ({ toast: { info: spies.toastInfo } }))
vi.mock("@/contexts/active-folder-context", () => ({
  useActiveFolder: () => ({ activeFolder: mockState.activeFolder }),
}))
vi.mock("@/contexts/tab-context", () => ({
  useTabActions: () => ({
    openNewConversationTab: spies.openNewConversationTab,
    openChatModeTab: spies.openChatModeTab,
  }),
}))
vi.mock("@/hooks/use-is-mac", () => ({ useIsMac: () => false }))
vi.mock("@/hooks/use-shortcut-settings", () => ({
  useShortcutSettings: () => ({
    shortcuts: { toggle_search: "mod+k", new_conversation: "mod+t" },
  }),
}))
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/hooks/use-appearance", () => ({
  useZoomLevel: () => ({ zoomLevel: 100, setZoomLevel: () => {} }),
}))

function renderSidebar() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <Sidebar />
    </NextIntlClientProvider>
  )
}

/**
 * Walk into one of the view-options menu's two visibility inventories, which
 * live behind submenus. Clicking a sub-trigger opens it synchronously; opening
 * it by HOVER runs on a 100ms Radix timer and is asserted separately below.
 *
 * This — and every click on a row inside the submenu — deliberately uses the
 * module-level `userEvent` instead of a `setup()` instance, matching the
 * quick-actions submenu tests. A shared instance remembers where the pointer
 * was, so the next click drags it off the sub-trigger first; Radix answers a
 * trigger-leave with its grace-area check, which needs real element geometry,
 * and jsdom reports every rect as 0×0. The check fails, the root menu takes
 * focus back, and the submenu closes out from under the click. A fresh
 * instance has no previous position, so nothing ever leaves the trigger.
 */
async function openViewOptionsGroup(
  group: "Conversation list" | "Navigation items"
) {
  await userEvent.click(screen.getByRole("button", { name: "View options" }))
  await userEvent.click(screen.getByRole("menuitem", { name: group }))
}

describe("Sidebar — fixed nav region", () => {
  beforeEach(() => {
    spies.openNewConversationTab.mockClear()
    spies.openChatModeTab.mockClear()
    spies.setRoute.mockClear()
    spies.openConversations.mockClear()
    spies.setSearchOpen.mockClear()
    spies.openSettingsWindow.mockClear()
    spies.toastInfo.mockClear()
    mockState.activeFolder = { id: 7, path: "/x" }
  })

  it("Automations navigates to the automations route", () => {
    const { getByText } = renderSidebar()
    fireEvent.click(getByText("Automations"))
    expect(spies.setRoute).toHaveBeenCalledWith("automations")
  })

  it("New chat returns to the conversation workspace", () => {
    const { getByText } = renderSidebar()
    fireEvent.click(getByText("New chat"))
    expect(spies.openConversations).toHaveBeenCalled()
  })

  it("New chat opens a conversation tab in the active folder", () => {
    const { getByText } = renderSidebar()
    fireEvent.click(getByText("New chat"))
    expect(spies.openNewConversationTab).toHaveBeenCalledWith(7, "/x")
  })

  it("renders the New chat shortcut hint", () => {
    const { getByText } = renderSidebar()
    // isMac=false → "mod" formats as "Ctrl". The badge is opacity-0 until the
    // row is hovered/focused but stays in the DOM, so getByText resolves it.
    expect(getByText("Ctrl+T")).toBeTruthy()
  })

  it("carries a Search row (ZCode layout) that opens the search dialog", () => {
    const { getByText } = renderSidebar()
    fireEvent.click(getByText("Search"))
    expect(spies.setSearchOpen).toHaveBeenCalledWith(true)
    // The Ctrl+K hint badge renders beside the label (in the DOM even while
    // hover-revealed opacity-0, same as the New chat badge).
    expect(getByText("Ctrl+K")).toBeTruthy()
  })

  it("plugin marketplace is a disabled 'coming soon' placeholder", () => {
    const { getByRole } = renderSidebar()
    const btn = getByRole("button", {
      name: "Plugin marketplace",
    }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    // The tooltip — not the label — carries the coming-soon message.
    expect(btn.getAttribute("title")).toBe("Coming soon")
  })

  it("falls back to chat mode (never disabled) when no folder is active", () => {
    mockState.activeFolder = null
    const { getByText } = renderSidebar()
    const btn = getByText("New chat").closest("button") as HTMLButtonElement
    // Defense-in-depth: the button stays clickable so a workspace that recovered
    // to no active folder is never a dead end — it opens folderless chat mode.
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    expect(spies.openChatModeTab).toHaveBeenCalled()
    expect(spies.openNewConversationTab).not.toHaveBeenCalled()
  })
})

describe("Sidebar — View options grouping", () => {
  beforeEach(() => {
    localStorage.clear()
    mockState.activeFolder = { id: 7, path: "/x" }
  })

  it("keeps both visibility inventories out of the root menu", async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByRole("button", { name: "View options" }))

    // The toggles sit one hop in, behind their group; Sort by stays inline.
    expect(
      screen.queryByRole("menuitemcheckbox", {
        name: "Show completed conversations",
      })
    ).toBeNull()
    expect(
      screen.queryByRole("menuitemcheckbox", { name: "Automations" })
    ).toBeNull()
    expect(
      screen.getByRole("menuitemradio", { name: "Created time" })
    ).toBeTruthy()

    expect(
      screen.getByRole("menuitem", { name: "Conversation list" })
    ).toBeTruthy()
    expect(
      screen.getByRole("menuitem", { name: "Navigation items" })
    ).toBeTruthy()
    await user.keyboard("{Escape}")
  })

  it("opens a group on hover alone, with no click", async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByRole("button", { name: "View options" }))

    // Load-bearing: without this the assertion below would also pass on a menu
    // that never nested the toggles in the first place.
    expect(
      screen.queryByRole("menuitemcheckbox", { name: "Automations" })
    ).toBeNull()

    // Pointing at the row is the whole interaction — Radix opens the submenu on
    // a short pointer-move timer, so this resolves without a second click.
    await user.hover(screen.getByRole("menuitem", { name: "Navigation items" }))

    expect(
      await screen.findByRole("menuitemcheckbox", { name: "Automations" })
    ).toBeTruthy()
    // Escape inside a submenu closes the whole stack, root included.
    await user.keyboard("{Escape}")
  })
})

describe("Sidebar — Show completed default", () => {
  beforeEach(() => {
    localStorage.clear()
    spies.listProps = null
    mockState.activeFolder = { id: 7, path: "/x" }
  })

  it("defaults Show completed off and threads it to the conversation list", () => {
    renderSidebar()
    expect(spies.listProps?.showCompleted).toBe(false)
  })

  it("respects an explicitly-stored 'true' from localStorage", () => {
    localStorage.setItem("workspace:sidebar-show-completed", "true")
    renderSidebar()
    // Hydration runs in a mount effect (flushed by render's act): a user who
    // checked it keeps it on despite the default-off.
    expect(spies.listProps?.showCompleted).toBe(true)
  })

  it("toggling the view-options item persists the choice and threads it down", async () => {
    renderSidebar()
    // Default off with a cleared store.
    expect(spies.listProps?.showCompleted).toBe(false)

    await openViewOptionsGroup("Conversation list")
    await userEvent.click(
      screen.getByRole("menuitemcheckbox", {
        name: "Show completed conversations",
      })
    )

    expect(localStorage.getItem("workspace:sidebar-show-completed")).toBe(
      "true"
    )
    expect(spies.listProps?.showCompleted).toBe(true)
    // The view-options menu is a settings panel: flipping one option must not
    // dismiss it — nor the submenu it lives in.
    expect(
      screen.getByRole("menuitemcheckbox", {
        name: "Show completed conversations",
      })
    ).toBeTruthy()
  })
})

describe("Sidebar — Navigation item visibility", () => {
  beforeEach(() => {
    localStorage.clear()
    mockState.activeFolder = { id: 7, path: "/x" }
  })

  // The nav rows are `button`s; the menu's toggles are `menuitemcheckbox`es, so
  // the two never collide even while the menu is open.
  const navRow = (name: string | RegExp) =>
    screen.queryByRole("button", { name })

  it("shows every route row by default", () => {
    renderSidebar()
    expect(navRow("Automations")).toBeTruthy()
    // Tasks left the nav rows in the ZCode layout — it is now its own section
    // (header + empty state) further down the sidebar.
    expect(screen.getByText("Tasks")).toBeTruthy()
    expect(screen.getByText("No tasks yet")).toBeTruthy()
  })

  it("hides a row when its menu toggle is switched off, and persists it", async () => {
    renderSidebar()

    await openViewOptionsGroup("Navigation items")
    await userEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Automations" })
    )
    // Like every other option here, flipping one must not dismiss the menu —
    // and the submenu it lives in has to survive too.
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Automations" })
    ).toBeTruthy()
    // Close it before looking at the rows: an open Radix menu is modal and
    // aria-hides the sidebar behind it, which would make "the row is gone" true
    // for the wrong reason. Escape inside a submenu closes the whole stack.
    await userEvent.keyboard("{Escape}")

    expect(navRow("Automations")).toBeNull()
    // Control: the tasks section is still there, so the assertion above is about
    // this one row rather than a hidden subtree.
    expect(screen.getByText("Tasks")).toBeTruthy()
    expect(
      JSON.parse(localStorage.getItem("workspace:sidebar-nav-items") ?? "{}")
    ).toEqual({ automations: false })
  })

  it("respects an explicitly-stored hidden row from localStorage", () => {
    localStorage.setItem(
      "workspace:sidebar-nav-items",
      JSON.stringify({ tasks: false })
    )
    renderSidebar()
    // Hiding tasks now removes its SECTION (header + empty state), since the
    // nav row no longer exists.
    expect(screen.queryByText("Tasks")).toBeNull()
    expect(navRow("Automations")).toBeTruthy()
  })

  it("ignores a stored entry for a route that no longer exists", () => {
    localStorage.setItem(
      "workspace:sidebar-nav-items",
      JSON.stringify({ retired: false, tasks: false })
    )
    renderSidebar()
    expect(screen.queryByText("Tasks")).toBeNull()
    expect(navRow("Automations")).toBeTruthy()
  })
})

describe("Sidebar — Expand / collapse all groups", () => {
  beforeEach(() => {
    localStorage.clear()
    spies.collapseAll.mockClear()
    spies.expandAll.mockClear()
    mockState.activeFolder = { id: 7, path: "/x" }
  })

  it("is an icon-only header button on desktop, no longer a menu row", async () => {
    const user = userEvent.setup()
    renderSidebar()

    // Icon-only, so the accessible name comes from aria-label and names the
    // action the click performs.
    const toggle = screen.getByRole("button", { name: "Collapse All Groups" })
    expect(toggle.textContent).toBe("")

    await user.click(screen.getByRole("button", { name: "View options" }))
    expect(
      screen.queryByRole("menuitem", { name: "Collapse All Groups" })
    ).toBeNull()
    await user.keyboard("{Escape}")
  })

  it("drives the list from the header in one click, and flips direction", async () => {
    const user = userEvent.setup()
    renderSidebar()

    // One click, from the header — it used to cost a trip through the menu.
    await user.click(
      screen.getByRole("button", { name: "Collapse All Groups" })
    )
    expect(spies.collapseAll).toHaveBeenCalledTimes(1)
    expect(spies.expandAll).not.toHaveBeenCalled()

    // The button now offers the opposite action, and performs it.
    await user.click(screen.getByRole("button", { name: "Expand All Groups" }))
    expect(spies.expandAll).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole("button", { name: "Collapse All Groups" })
    ).toBeTruthy()
  })
})

describe("Sidebar — ZCode layout", () => {
  beforeEach(() => {
    localStorage.clear()
    spies.setRoute.mockClear()
    spies.setSearchOpen.mockClear()
    spies.openSettingsWindow.mockClear()
    spies.toastInfo.mockClear()
    // The gear handler chains `.catch` on the returned promise; the spy must
    // resolve or the click surfaces an unhandled TypeError.
    spies.openSettingsWindow.mockResolvedValue(undefined)
    mockState.activeFolder = { id: 7, path: "/x" }
  })

  // "Projects" is ambiguous in the sidebar: the bottom ProjectTreeAddButton's
  // menu trigger carries the same accessible name. The view pills are the only
  // toggle buttons here, so pick the `aria-pressed` one.
  const viewPill = (name: string) => {
    const pill = screen
      .getAllByRole("button", { name })
      .find((el) => el.getAttribute("aria-pressed") != null)
    expect(pill).toBeTruthy()
    return pill as HTMLElement
  }

  it("view switcher defaults to the Projects pill", () => {
    renderSidebar()
    expect(viewPill("Projects").getAttribute("aria-pressed")).toBe("true")
    expect(viewPill("Groups").getAttribute("aria-pressed")).toBe("false")
  })

  it("Groups pill is a visual placeholder that toasts coming-soon", async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(viewPill("Groups"))
    // This release keeps the Groups view a visual placeholder: the click never
    // switches the list — it just tells the user the view is on its way.
    expect(spies.toastInfo).toHaveBeenCalledWith("Coming soon")
    expect(viewPill("Projects").getAttribute("aria-pressed")).toBe("true")
  })

  it("tasks empty state navigates to the tasks route", async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByText("No tasks yet"))
    expect(spies.setRoute).toHaveBeenCalledWith("tasks")
  })

  it("account row's settings gear opens the settings window", async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByRole("button", { name: "Settings" }))
    expect(spies.openSettingsWindow).toHaveBeenCalledTimes(1)
  })

  it("account row shows the placeholder user with an initial avatar", () => {
    renderSidebar()
    expect(screen.getByText("Local user")).toBeTruthy()
    // The circular avatar carries the label's initial.
    expect(screen.getByText("L")).toBeTruthy()
  })
})
