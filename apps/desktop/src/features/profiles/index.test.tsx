import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProfileMaintenancePort, UpdateProfileConfigIntent } from '@/application/profile/profile-maintenance-port'
import { stubMenuDomApis, stubResizeObserver } from '@/dev/test/jsdom'
import { $agentBoxHello, $agentBoxProfiles, $agentBoxProviderModels, $agentBoxService } from '@/store/agentbox-service'
import {
  asWireId,
  type ConfigDescriptor,
  type ProfileRecord,
  type ProfilesUpdateConfigResult,
  type ProviderModelConfigRecord,
  type ProviderModelRef,
  WIRE_PROTOCOL_VERSION
} from '@/types/wire/wire-v1'

import { ProfilesView } from './index'

const mocks = vi.hoisted(() => ({
  ensureCatalog: vi.fn(async () => []),
  ensureProviderModels: vi.fn(async () => []),
  loadDescriptor: vi.fn()
}))

vi.mock('@/api/agentbox-runtime-client', () => ({ agentBoxRuntimeClient: () => ({}) }))
vi.mock('@/application/provider-model/wire-provider-model-catalog', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureAgentBoxProviderModelCatalog: () => mocks.ensureProviderModels()
}))
// The capability gate and the production maintenance port stay REAL: only the
// descriptor read is stubbed, so the page's own gating is what is under test.
vi.mock('@/application/profile/profile-maintenance-port', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadProfileRuntimeDescriptor: (_client: unknown, profileId: string) => mocks.loadDescriptor(profileId)
}))
vi.mock('@/application/profile/wire-composer-profile', () => ({
  ensureAgentBoxProfileCatalog: () => mocks.ensureCatalog()
}))

stubMenuDomApis()
stubResizeObserver()

const MAINTENANCE_METHODS = ['profiles.create', 'profiles.update', 'profiles.updateConfig', 'profiles.archive']

const hello = (ids: string[]) => ({
  auth: { required: false as const },
  capabilities: ids.map(id => ({ id, supported: true })),
  protocolVersion: WIRE_PROTOCOL_VERSION as typeof WIRE_PROTOCOL_VERSION,
  serverId: asWireId('server-test')
})

const slotRef = (
  modelId: string,
  availability: ProviderModelRef['availability'] = 'available',
  unavailableReason: null | string = null
): ProviderModelRef => ({ availability, modelId, providerId: asWireId('provider-one'), unavailableReason })

const modelEntry = (
  modelId: string,
  availability: ProviderModelConfigRecord['models'][number]['availability'] = 'available',
  unavailableReason: null | string = null
): ProviderModelConfigRecord['models'][number] => ({
  availability,
  displayName: modelId,
  modelId,
  unavailableReason
})

const providerModel = (overrides: Partial<ProviderModelConfigRecord> = {}): ProviderModelConfigRecord => ({
  archivedAt: null,
  configuration: [],
  createdAt: '2026-09-14T00:00:00.000Z',
  credentialId: null,
  displayName: 'Provider One',
  harness: 'opaque-alpha',
  id: asWireId('provider-one'),
  models: [modelEntry('vendor/family/model-v1')],
  provider: 'opaque-provider',
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1,
  ...overrides
})

/** The service's own description of a Profile's default configuration. */
const serviceDescriptor = (profileId: string, values: { mode?: string; notes?: string } = {}): ConfigDescriptor => ({
  controls: [
    {
      controlId: 'mode',
      currentValue: values.mode ?? 'balanced',
      editable: true,
      kind: 'enum',
      values: ['fast', 'balanced']
    },
    { controlId: 'notes', currentValue: values.notes ?? 'keep me', editable: true, kind: 'string', multiline: false },
    { controlId: 'verbose', currentValue: true, editable: true, kind: 'boolean' },
    { controlId: 'locked_flag', currentValue: true, editable: true, kind: 'boolean' },
    {
      controlId: 'primary_model',
      currentValue: 'primary',
      editable: true,
      kind: 'model_slot',
      slots: [{ model: slotRef('vendor/family/model-v1'), name: 'primary' }]
    }
  ],
  effectTiming: 'next_send',
  profileId: asWireId(profileId),
  securityLockedIds: ['locked_flag'],
  workspaceId: null
})

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

const configResult = (overrides: Partial<ProfilesUpdateConfigResult> = {}): ProfilesUpdateConfigResult => ({
  configVersion: 4,
  effectiveFor: 'next_send',
  profile: profile({ version: 4 }),
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
  updateConfig: vi.fn(async intent => configResult({ profile: profile({ version: intent.expectedVersion + 1 }) })),
  ...overrides
})

function realClick(element: HTMLElement): void {
  fireEvent.pointerDown(element, { button: 0, pointerType: 'mouse' })
  fireEvent.pointerUp(element, { button: 0, pointerType: 'mouse' })
  fireEvent.click(element)
}

const field = (name: string): HTMLInputElement => screen.getByRole('textbox', { name }) as HTMLInputElement

const saveButton = (): HTMLElement => screen.getByRole('button', { name: 'Save profile' })

const openSelect = (name: string): void => realClick(screen.getByRole('combobox', { name }))

beforeEach(() => {
  mocks.loadDescriptor.mockImplementation(async (profileId: string) => serviceDescriptor(profileId))
  $agentBoxService.set({ detail: null, phase: 'ready' })
})

afterEach(() => {
  cleanup()
  $agentBoxProfiles.set([])
  $agentBoxHello.set(null)
  $agentBoxProviderModels.set([])
  $agentBoxService.set({ detail: null, phase: 'idle' })
  mocks.ensureCatalog.mockClear()
  mocks.ensureProviderModels.mockClear()
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

  it('offers no editable control when the service has not declared profiles.updateConfig', async () => {
    $agentBoxProfiles.set([profile()])
    $agentBoxHello.set(hello(['profiles.create', 'profiles.update', 'profiles.archive']))

    render(<ProfilesView onClose={vi.fn()} />)

    expect(await screen.findByText('balanced')).toBeTruthy()
    expect(screen.getByText('Profile maintenance is unavailable')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save profile' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Notes' })).toBeNull()
  })

  it('names the missing provider/model record, not a missing capability, on an empty service', async () => {
    // The service declares every maintenance method and has simply no
    // provider/model record yet. Blaming the service for an undeclared
    // capability here would send the reader looking for a problem that does
    // not exist.
    $agentBoxHello.set(hello(MAINTENANCE_METHODS))

    render(<ProfilesView onClose={vi.fn()} />)

    expect(await screen.findByText('No profiles yet.')).toBeTruthy()
    expect(
      screen.getByText('Add a service-owned provider/model configuration to make it available to Profiles.')
    ).toBeTruthy()
    expect(screen.queryByText('Profile maintenance is unavailable')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New profile' })).toBeNull()
  })

  it('builds the Harness choices from the provider/model directory, so a first Profile can be created', async () => {
    // The cold-start case: no Profile exists yet, so nothing can be derived
    // from the Profile list, and the choices have to come from the directory
    // a Profile is actually built on.
    $agentBoxHello.set(hello(MAINTENANCE_METHODS))
    $agentBoxProviderModels.set([
      providerModel({ harness: 'opaque-alpha' }),
      providerModel({ harness: 'opaque-beta', id: asWireId('provider-two') })
    ])

    render(<ProfilesView onClose={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'New profile' }))
    realClick(await screen.findByRole('combobox'))

    expect(await screen.findByRole('option', { name: 'opaque-alpha' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'opaque-beta' })).toBeTruthy()
  })

  it('edits the service-described defaults once the whole maintenance set is declared', async () => {
    $agentBoxProfiles.set([profile()])
    $agentBoxHello.set(hello(MAINTENANCE_METHODS))

    render(<ProfilesView onClose={vi.fn()} />)

    expect(await screen.findByRole('textbox', { name: 'Name' })).toBeTruthy()
    expect(field('Notes').value).toBe('keep me')
    expect(screen.getByRole('combobox', { name: 'Mode' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Primary model' }).textContent).toContain('vendor/family/model-v1')
    expect(screen.queryByRole('button', { name: 'Save profile' })).toBeNull()
  })

  it('keeps the last projection when editing fails instead of reporting local success', async () => {
    const update = vi.fn(async () => {
      throw new Error('CONFLICT_VERSION')
    })

    const maintenance = maintenancePort({ update })
    $agentBoxProfiles.set([profile()])

    render(<ProfilesView maintenance={maintenance} onClose={vi.fn()} />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Name' }), { target: { value: 'New name' } })
    fireEvent.click(saveButton())

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

    await waitFor(() =>
      expect(maintenance.create).toHaveBeenCalledWith({ displayName: 'Builder', harness: 'opaque-beta' })
    )
    expect($agentBoxProfiles.get()).toEqual([
      expect.objectContaining({ displayName: 'Builder', harness: 'opaque-beta', id: 'profile-created' })
    ])
  })

  it('renames first and then replaces the configuration with the version the rename returned', async () => {
    const update = vi.fn(async (intent: { displayName: string }) =>
      profile({ displayName: intent.displayName, version: 7 })
    )

    const updateConfig = vi.fn(async (intent: UpdateProfileConfigIntent) =>
      configResult({
        configVersion: 8,
        profile: profile({ displayName: 'Renamed', version: intent.expectedVersion + 1 })
      })
    )

    const maintenance = maintenancePort({ update, updateConfig })
    $agentBoxProfiles.set([profile()])

    render(<ProfilesView maintenance={maintenance} onClose={vi.fn()} />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Name' }), { target: { value: 'Renamed' } })
    fireEvent.change(field('Notes'), { target: { value: 'updated note' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(updateConfig).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith({ displayName: 'Renamed', expectedVersion: 3, profileId: 'profile-reviewer' })
    expect(updateConfig.mock.calls[0]?.[0]).toMatchObject({ expectedVersion: 7, profileId: 'profile-reviewer' })
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(updateConfig.mock.invocationCallOrder[0]!)
    expect($agentBoxProfiles.get()[0]).toMatchObject({ displayName: 'Renamed', version: 8 })
  })

  it('adopts the display name the service normalized, leaving nothing left to save', async () => {
    const update = vi.fn(async (_intent: { displayName: string }) =>
      profile({ displayName: 'Builder (normalized)', version: 7 })
    )

    const updateConfig = vi.fn(async (_intent: UpdateProfileConfigIntent) => configResult())

    $agentBoxProfiles.set([profile()])

    render(<ProfilesView maintenance={maintenancePort({ update, updateConfig })} onClose={vi.fn()} />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Name' }), { target: { value: 'builder' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(field('Name').value).toBe('Builder (normalized)'))
    expect($agentBoxProfiles.get()[0]).toMatchObject({ displayName: 'Builder (normalized)', version: 7 })
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith({ displayName: 'builder', expectedVersion: 3, profileId: 'profile-reviewer' })
    expect(updateConfig).not.toHaveBeenCalled()
    // The submitted value is gone, so there is no stale dirty state to save.
    expect(screen.queryByRole('button', { name: 'Save profile' })).toBeNull()
  })

  it('sends the whole configuration: untouched and locked values kept, restored values dropped', async () => {
    const updateConfig = vi.fn(async (_intent: UpdateProfileConfigIntent) => configResult())
    const update = vi.fn(async () => profile())
    const maintenance = maintenancePort({ update, updateConfig })
    $agentBoxProfiles.set([profile()])

    render(<ProfilesView maintenance={maintenance} onClose={vi.fn()} />)

    await screen.findByRole('combobox', { name: 'Mode' })
    fireEvent.change(field('Notes'), { target: { value: 'edited' } })

    openSelect('Mode')
    fireEvent.click(await screen.findByRole('option', { name: 'Not set' }))
    fireEvent.click(saveButton())

    await waitFor(() => expect(updateConfig).toHaveBeenCalledTimes(1))
    expect(update).not.toHaveBeenCalled()
    expect(updateConfig.mock.calls[0]?.[0].values).toEqual([
      { controlId: 'notes', value: 'edited' },
      { controlId: 'verbose', value: true },
      { controlId: 'locked_flag', value: true },
      { controlId: 'primary_model', value: { modelId: 'vendor/family/model-v1', providerId: 'provider-one' } }
    ])
  })

  it('sends the service-offered enum value, the toggled boolean, and the locked service value', async () => {
    const updateConfig = vi.fn(async (_intent: UpdateProfileConfigIntent) => configResult())
    $agentBoxProfiles.set([profile()])

    render(<ProfilesView maintenance={maintenancePort({ updateConfig })} onClose={vi.fn()} />)

    await screen.findByRole('combobox', { name: 'Mode' })
    openSelect('Mode')
    fireEvent.click(await screen.findByRole('option', { name: 'fast' }))

    fireEvent.click(screen.getByRole('switch', { name: 'Verbose' }))

    // A security-locked control answers no click, and keeps its service value.
    fireEvent.click(screen.getByRole('switch', { name: 'Locked flag' }))
    fireEvent.click(saveButton())

    await waitFor(() => expect(updateConfig).toHaveBeenCalledTimes(1))

    const values = updateConfig.mock.calls[0]?.[0].values
    expect(values).toContainEqual({ controlId: 'mode', value: 'fast' })
    expect(values).toContainEqual({ controlId: 'verbose', value: false })
    expect(values).toContainEqual({ controlId: 'locked_flag', value: true })
  })

  it('sends the exact provider/model reference chosen from the directory', async () => {
    const updateConfig = vi.fn(async (_intent: UpdateProfileConfigIntent) => configResult())
    $agentBoxProfiles.set([profile()])
    $agentBoxProviderModels.set([providerModel({ models: [modelEntry('vendor/family/model-v9')] })])

    render(<ProfilesView maintenance={maintenancePort({ updateConfig })} onClose={vi.fn()} />)

    await screen.findByRole('combobox', { name: 'Primary model' })
    openSelect('Primary model')
    fireEvent.click(await screen.findByRole('option', { name: /vendor\/family\/model-v9/ }))
    fireEvent.click(saveButton())

    await waitFor(() => expect(updateConfig).toHaveBeenCalledTimes(1))
    expect(updateConfig.mock.calls[0]?.[0].values).toContainEqual({
      controlId: 'primary_model',
      value: { modelId: 'vendor/family/model-v9', providerId: 'provider-one' }
    })
  })

  it('keeps the service-normalized name and the draft when only the configuration update fails', async () => {
    const update = vi.fn(async (intent: { displayName: string }) =>
      profile({ displayName: `${intent.displayName} (normalized)`, version: 7 })
    )

    const updateConfig = vi.fn(async (_intent: UpdateProfileConfigIntent) => {
      throw new Error('CONFLICT_VERSION')
    })

    $agentBoxProfiles.set([profile()])

    render(<ProfilesView maintenance={maintenancePort({ update, updateConfig })} onClose={vi.fn()} />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Name' }), { target: { value: 'Renamed' } })
    fireEvent.change(field('Notes'), { target: { value: 'edited' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(updateConfig).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('CONFLICT_VERSION')).toBeTruthy()
    expect($agentBoxProfiles.get()[0]).toMatchObject({ displayName: 'Renamed (normalized)', version: 7 })
    expect(field('Name').value).toBe('Renamed (normalized)')
    expect(field('Notes').value).toBe('edited')

    // Retrying resumes at the version the successful rename returned, and does
    // not send the rename a second time.
    fireEvent.click(saveButton())

    await waitFor(() => expect(updateConfig).toHaveBeenCalledTimes(2))
    expect(update).toHaveBeenCalledTimes(1)
    expect(updateConfig.mock.calls[1]?.[0]).toMatchObject({ expectedVersion: 7, profileId: 'profile-reviewer' })
  })

  it('holds the name input and the configuration controls while a save is pending', async () => {
    let settle!: (result: ProfilesUpdateConfigResult) => void

    const updateConfig = vi.fn(
      () =>
        new Promise<ProfilesUpdateConfigResult>(resolve => {
          settle = resolve
        })
    )

    const update = vi.fn(async () => profile())

    $agentBoxProfiles.set([profile()])

    render(<ProfilesView maintenance={maintenancePort({ update, updateConfig })} onClose={vi.fn()} />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Notes' }), { target: { value: 'edited' } })

    // One captured button, clicked twice while the first save is still pending.
    const button = saveButton()
    fireEvent.click(button)
    fireEvent.click(button)

    expect(updateConfig).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
    // Nothing may build intent the in-flight request cannot carry.
    expect(field('Name').disabled).toBe(true)
    expect(field('Notes').disabled).toBe(true)
    expect(button.hasAttribute('disabled')).toBe(true)

    await act(async () => {
      settle(configResult({ profile: profile({ version: 4 }) }))
    })

    expect(await screen.findByText('Profile configuration saved. It applies to the next send.')).toBeTruthy()
    expect(field('Name').disabled).toBe(false)
  })

  it('adopts the descriptor the service normalizes to after saving, and states the effect timing', async () => {
    const updateConfig = vi.fn(async (_intent: UpdateProfileConfigIntent) =>
      configResult({ profile: profile({ version: 4 }) })
    )

    mocks.loadDescriptor
      .mockImplementationOnce(async (profileId: string) => serviceDescriptor(profileId))
      .mockImplementationOnce(async (profileId: string) =>
        serviceDescriptor(profileId, { notes: 'normalized by service' })
      )

    $agentBoxProfiles.set([profile()])

    render(<ProfilesView maintenance={maintenancePort({ updateConfig })} onClose={vi.fn()} />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Notes' }), { target: { value: 'raw value' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(updateConfig).toHaveBeenCalledTimes(1))
    expect(updateConfig.mock.calls[0]?.[0].values).toContainEqual({ controlId: 'notes', value: 'raw value' })

    await waitFor(() => expect(field('Notes').value).toBe('normalized by service'))

    const notice = screen.getByText('Profile configuration saved. It applies to the next send.')
    expect(notice.getAttribute('data-effective-for')).toBe('next_send')
    expect(notice.textContent).not.toContain('Execution')
  })

  it('never paints a late descriptor onto the profile the user switched to', async () => {
    const pending: Array<() => void> = []

    mocks.loadDescriptor.mockImplementation(
      (profileId: string) =>
        new Promise<ConfigDescriptor>(resolve => {
          pending.push(() =>
            resolve(serviceDescriptor(profileId, { notes: profileId === 'profile-second' ? 'second' : 'stale first' }))
          )
        })
    )

    $agentBoxProfiles.set([profile(), profile({ displayName: 'Second', id: asWireId('profile-second') })])

    render(<ProfilesView maintenance={maintenancePort()} onClose={vi.fn()} />)

    await waitFor(() => expect(pending.length).toBe(1))

    // The row's own select target comes before its overflow-menu button.
    fireEvent.click(screen.getAllByRole('button', { name: 'Second' })[0]!)
    await waitFor(() => expect(pending.length).toBe(2))

    await act(async () => {
      pending[1]?.()
    })
    expect(field('Notes').value).toBe('second')

    await act(async () => {
      pending[0]?.()
    })
    expect(field('Notes').value).toBe('second')
    expect(screen.queryByText('stale first')).toBeNull()
  })
})
