import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProfileMaintenancePort } from '@/application/profile/profile-maintenance-port'
import { stubMenuDomApis, stubResizeObserver } from '@/dev/test/jsdom'
import { $agentBoxHello, $agentBoxProfiles, $agentBoxService } from '@/store/agentbox-service'
import { asWireId, type ProfileRecord } from '@/types/wire/wire-v1'

import { ProfilesView } from './index'

const mocks = vi.hoisted(() => ({
  ensureCatalog: vi.fn(async () => []),
  loadDescriptor: vi.fn(async (profileId: string) => ({
    controls: [
      {
        controlId: 'model',
        currentValue: 'balanced',
        editable: true,
        kind: 'enum' as const,
        values: ['fast', 'balanced']
      }
    ],
    effectTiming: 'next_send' as const,
    profileId: asWireId(profileId),
    securityLockedIds: [],
    workspaceId: null
  }))
}))

vi.mock('@/api/agentbox-runtime-client', () => ({ agentBoxRuntimeClient: () => ({}) }))
vi.mock('@/application/profile/profile-maintenance-port', () => ({
  harnessChoicesFromProfiles: () => [],
  loadProfileRuntimeDescriptor: (_client: unknown, profileId: string) => mocks.loadDescriptor(profileId),
  wireProfileMaintenancePort: () => undefined
}))
vi.mock('@/application/profile/wire-composer-profile', () => ({
  ensureAgentBoxProfileCatalog: () => mocks.ensureCatalog()
}))

stubMenuDomApis()
stubResizeObserver()

const profile = (overrides: Partial<ProfileRecord> = {}): ProfileRecord => ({
  archivedAt: null,
  capabilities: { native_memory: true, resume: false },
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName: 'Reviewer',
  harness: 'opaque-alpha',
  id: asWireId('profile-reviewer'),
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 3,
  ...overrides
})

const maintenancePort = (overrides: Partial<ProfileMaintenancePort> = {}): ProfileMaintenancePort => ({
  archive: vi.fn(async intent =>
    profile({ archivedAt: '2026-09-14T01:00:00.000Z', id: asWireId(intent.profileId), version: 4 })
  ),
  create: vi.fn(async intent =>
    profile({ displayName: intent.displayName, harness: intent.harness, id: asWireId('profile-created'), version: 1 })
  ),
  harnessChoices: [
    { id: 'opaque-alpha', label: 'Alpha toolbench' },
    { id: 'opaque-beta', label: 'Beta toolbench' }
  ],
  update: vi.fn(async intent => profile({ displayName: intent.displayName, version: intent.expectedVersion + 1 })),
  ...overrides
})

function realClick(element: HTMLElement): void {
  fireEvent.pointerDown(element, { button: 0, pointerType: 'mouse' })
  fireEvent.pointerUp(element, { button: 0, pointerType: 'mouse' })
  fireEvent.click(element)
}

afterEach(() => {
  cleanup()
  $agentBoxProfiles.set([])
  $agentBoxHello.set(null)
  $agentBoxService.set({ detail: null, phase: 'idle' })
  mocks.ensureCatalog.mockClear()
  mocks.loadDescriptor.mockClear()
})

describe('AgentBox ProfilesView', () => {
  it('renders the neutral service projection; Harness is a badge and capabilities stay service-declared', async () => {
    $agentBoxProfiles.set([profile()])
    $agentBoxService.set({ detail: null, phase: 'ready' })

    render(<ProfilesView onClose={vi.fn()} />)

    expect(await screen.findByRole('heading', { name: 'Reviewer' })).toBeTruthy()
    expect(screen.getAllByText('opaque-alpha').length).toBeGreaterThan(0)
    expect(screen.getByText('native_memory · Available')).toBeTruthy()
    expect(screen.getByText('resume · Unavailable')).toBeTruthy()
    expect(screen.getByText('Profile maintenance is unavailable')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New profile' })).toBeNull()
    expect(await screen.findByText('balanced')).toBeTruthy()
  })

  it('keeps the last projection when editing fails instead of reporting local success', async () => {
    const update = vi.fn(async () => {
      throw new Error('CONFLICT_VERSION')
    })

    const maintenance = maintenancePort({ update })
    $agentBoxProfiles.set([profile()])
    $agentBoxService.set({ detail: null, phase: 'ready' })

    render(<ProfilesView maintenance={maintenance} onClose={vi.fn()} />)

    const name = await screen.findByRole('textbox', { name: 'Name' })
    fireEvent.change(name, { target: { value: 'New name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(await screen.findByText('CONFLICT_VERSION')).toBeTruthy()
    expect($agentBoxProfiles.get()[0]?.displayName).toBe('Reviewer')
    expect(update).toHaveBeenCalledWith({
      displayName: 'New name',
      expectedVersion: 3,
      profileId: 'profile-reviewer'
    })
  })

  it('creates through the injected maintenance port and adopts only its returned record', async () => {
    const maintenance = maintenancePort()
    $agentBoxService.set({ detail: null, phase: 'ready' })

    render(<ProfilesView maintenance={maintenance} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'New profile' }))
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Builder' } })

    realClick(screen.getByRole('combobox'))
    fireEvent.click(await screen.findByRole('option', { name: 'Beta toolbench' }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create profile' }))
    })

    await waitFor(() => expect(maintenance.create).toHaveBeenCalledWith({ displayName: 'Builder', harness: 'opaque-beta' }))
    expect($agentBoxProfiles.get()).toEqual([
      expect.objectContaining({ displayName: 'Builder', harness: 'opaque-beta', id: 'profile-created' })
    ])
  })
})
