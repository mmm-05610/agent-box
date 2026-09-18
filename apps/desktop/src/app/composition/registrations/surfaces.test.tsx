import { cleanup, render, screen } from '@testing-library/react'
import { atom } from 'nanostores'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SidebarActions, WiringActions } from '@/app/composition/wiring/types'

import { ChatRoutesSurface, SidebarSurface, StatusbarSurface } from './surfaces'

const captured = vi.hoisted(() => ({
  sidebarProps: null as null | Record<string, unknown>,
  statusSnapshotArgs: null as null | unknown[],
  statusbarOptions: null as null | Record<string, unknown>
}))

vi.mock('@/extension/contrib/react/use-contributions', () => ({ useContributions: vi.fn() }))
vi.mock('@/store/connections', () => ({ $activeConnectionId: atom('local') }))
vi.mock('@/store/gateway', () => ({ $gateway: atom<unknown>(null) }))
vi.mock('@/store/profile/runtime-route-state', () => ({ $activeGatewayProfile: atom('default') }))
vi.mock('@/store/session', () => ({
  $freshDraftReady: atom(false),
  $gatewayState: atom('open')
}))
vi.mock('@/features/chat', () => ({
  ChatView: ({ gateway }: { gateway: { id?: string } | null }) => <div data-testid="gateway">{gateway?.id}</div>
}))
vi.mock('@/features/chat/agentbox-chat-view', () => ({
  AgentBoxChatView: () => <div data-testid="agentbox-chat" />
}))
vi.mock('@/features/chat/sidebar', () => ({
  ChatSidebar: (props: Record<string, unknown>) => {
    captured.sidebarProps = props

    return null
  }
}))
vi.mock('@/features/right-sidebar/terminal/chrome', () => ({ TerminalPaneChrome: () => null }))
vi.mock('@/features/runtime/use-status-snapshot', () => ({
  useStatusSnapshot: (...args: unknown[]) => {
    captured.statusSnapshotArgs = args

    return { inferenceStatus: null, statusSnapshot: null }
  }
}))
vi.mock('@/app/composition/registrations/statusbar-items', () => ({
  useStatusbarItems: (options: Record<string, unknown>) => {
    captured.statusbarOptions = options

    return { leftStatusbarItems: [], statusbarItems: [] }
  }
}))
vi.mock('@/app/shell/chrome/statusbar/statusbar-controls', () => ({ StatusbarControls: () => null }))
vi.mock('@/app/routes', () => ({
  contributedRoutes: () => [],
  NEW_CHAT_ROUTE: '/new',
  ROUTES_AREA: 'routes',
  SETTINGS_ROUTE: '/settings',
  sessionRoute: (id: string) => `/${id}`
}))
vi.mock('@/app/composition/wiring/latest-actions', () => ({ latestChatActions: () => ({}), latestSidebarActions: () => ({}) }))
vi.mock('@/app/composition/registrations/chrome-contributions', () => ({
  setStatusbarItemGroup: vi.fn(),
  useStatusbarContributions: () => []
}))
vi.mock('@/features/profiles/model-menu-panel', () => ({ ModelMenuPanel: () => null }))

afterEach(() => {
  cleanup()
})

describe('ChatRoutesSurface', () => {
  it('mounts the AgentBox product chat without selecting a Hermes gateway', () => {
    const actions = {} as WiringActions

    render(
      <MemoryRouter>
        <ChatRoutesSurface actions={actions} />
      </MemoryRouter>
    )

    expect(screen.getByTestId('agentbox-chat')).toBeTruthy()
    expect(screen.queryByTestId('gateway')).toBeNull()
  })
})

describe('product surface authority', () => {
  it('composes the sidebar with the AgentBox session authority instead of letting it infer one', () => {
    render(
      <MemoryRouter>
        <SidebarSurface actions={{} as SidebarActions} currentView="chat" />
      </MemoryRouter>
    )

    expect((captured.sidebarProps as unknown as SidebarActions & { sessionAuthority?: string }).sessionAuthority).toBe(
      'agentbox'
    )
  })

  it('hands the statusbar no status source at all, so it can poll no legacy endpoint', () => {
    render(
      <MemoryRouter>
        <StatusbarSurface
          actions={{} as WiringActions}
          agentsOpen={false}
          chatOpen
          commandCenterOpen={false}
        />
      </MemoryRouter>
    )

    expect(captured.statusSnapshotArgs?.[0]).toBeNull()
  })

  it('names the AgentBox authority for the statusbar items instead of letting them infer one', () => {
    render(
      <MemoryRouter>
        <StatusbarSurface
          actions={{} as WiringActions}
          agentsOpen={false}
          chatOpen
          commandCenterOpen={false}
        />
      </MemoryRouter>
    )

    expect(captured.statusbarOptions?.authority).toBe('agentbox')
  })
})

describe('product routes for views AgentBox does not mount', () => {
  function LocationProbe() {
    const location = useLocation()

    return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
  }

  function renderAt(path: string) {
    render(
      <MemoryRouter initialEntries={[path]}>
        <ChatRoutesSurface actions={{} as WiringActions} />
        <LocationProbe />
      </MemoryRouter>
    )
  }

  for (const path of ['/agents', '/cron', '/starmap', '/webhooks']) {
    it(`sends ${path} to the honest unavailable product page instead of a legacy view`, () => {
      // Those views read the legacy Hermes REST plane. A deep link must land on
      // the product page that states the capability is not available, never on
      // the view itself.
      renderAt(path)

      expect(screen.getByTestId('location').textContent).toBe('/settings?tab=product:resources')
    })
  }
})
