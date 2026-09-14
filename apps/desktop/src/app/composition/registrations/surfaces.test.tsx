import { cleanup, render, screen } from '@testing-library/react'
import { atom } from 'nanostores'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { WiringActions } from '@/app/composition/wiring/types'

import { ChatRoutesSurface } from './surfaces'

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
vi.mock('@/features/chat/sidebar', () => ({ ChatSidebar: () => null }))
vi.mock('@/features/right-sidebar/terminal/chrome', () => ({ TerminalPaneChrome: () => null }))
vi.mock('@/features/runtime/use-status-snapshot', () => ({ useStatusSnapshot: () => ({}) }))
vi.mock('@/app/composition/registrations/statusbar-items', () => ({
  useStatusbarItems: () => ({ leftStatusbarItems: [], statusbarItems: [] })
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
