import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  CreateProviderModelIntent,
  ProviderModelMaintenancePort
} from '@/application/provider-model/provider-model-maintenance-port'
import { I18nProvider } from '@/i18n'
import { $agentBoxHello, $agentBoxProviderModels, $agentBoxService } from '@/store/agentbox-service'
import { asWireId } from '@/types/wire/wire-v1'
import type { ProviderModelConfigRecord } from '@/types/wire/wire-v1'

import { AgentBoxModelSettings } from './agentbox-model-settings'

const record = (overrides: Partial<ProviderModelConfigRecord> = {}): ProviderModelConfigRecord => ({
  id: asWireId('pm-1'),
  version: 2,
  displayName: 'Team model',
  harness: 'opaque-harness',
  provider: 'opaque-provider',
  credentialId: asWireId('cred-1'),
  configuration: [{ controlId: 'region', value: 'us' }],
  models: [{ modelId: 'model-a', displayName: 'Model A', availability: 'available', unavailableReason: null }],
  archivedAt: null,
  createdAt: '2026-09-14T00:00:00Z',
  updatedAt: '2026-09-14T00:00:00Z',
  ...overrides
})

const CREDENTIAL_ID = 'credential_' + 'a'.repeat(32)

function renderPage(
  port: ProviderModelMaintenancePort,
  credentials?: {
    add: (request: { kind: string; label: string; secret: string }) => Promise<never | object>
    list: () => Promise<{ credentialId: string; kind: string; label: string }[]>
  }
) {
  return render(
    <I18nProvider localePreference={null}>
      <AgentBoxModelSettings credentials={credentials as never} maintenance={port} />
    </I18nProvider>
  )
}

afterEach(cleanup)
afterEach(() => {
  $agentBoxService.set({ detail: null, phase: 'idle' })
  $agentBoxHello.set(null)
  $agentBoxProviderModels.set([])
})

describe('AgentBoxModelSettings', () => {
  it('does not offer controls before the service declares all capabilities', () => {
    render(
      <I18nProvider localePreference={null}>
        <AgentBoxModelSettings />
      </I18nProvider>
    )
    expect(screen.getByText('Not available yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add model configuration' })).toBeNull()
  })

  it('renders service data and sends create intent', async () => {
    const create = vi.fn(async () =>
      record({
        id: asWireId('pm-2'),
        displayName: 'New model',
        credentialId: null,
        configuration: [],
        models: [{ modelId: 'model-b', displayName: 'Model B', availability: 'unknown', unavailableReason: null }]
      })
    )

    const port = {
      list: vi.fn(async () => ({ items: [record()], nextCursor: null })),
      create,
      update: vi.fn(),
      archive: vi.fn()
    } as unknown as ProviderModelMaintenancePort

    renderPage(port)
    expect(await screen.findByText('Model A (model-a)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add model configuration' }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), { target: { value: 'New model' } })
    // The harness comes from the directory the service itself populated…
    fireEvent.change(screen.getByRole('combobox', { name: 'Harness' }), { target: { value: 'opaque-harness' } })
    // …and the provider from the preset catalog.
    fireEvent.change(screen.getByRole('combobox', { name: 'Provider' }), { target: { value: 'deepseek' } })
    fireEvent.change(screen.getByLabelText('Model ID'), { target: { value: 'model-b' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Model name' }), { target: { value: 'Model B' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          credentialId: null,
          configuration: [],
          harness: 'opaque-harness',
          models: [{ modelId: 'model-b', displayName: 'Model B', availability: 'unknown', unavailableReason: null }],
          provider: 'deepseek'
        })
      )
    )
  })

  it('keeps a failed archive visible and adopts a successful archive result', async () => {
    const archive = vi
      .fn()
      .mockRejectedValueOnce(new Error('CONFLICT_REFERENCE'))
      .mockResolvedValueOnce(record({ archivedAt: '2026-09-14T01:00:00Z' }))

    const port = {
      list: vi.fn(async () => ({ items: [record()], nextCursor: null })),
      create: vi.fn(),
      update: vi.fn(),
      archive
    } as unknown as ProviderModelMaintenancePort

    renderPage(port)
    await screen.findByText('Model A (model-a)')
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Archive' }).at(-1)!)
    await waitFor(() => expect(screen.getByText('Model A (model-a)')).toBeTruthy())
    expect(screen.getAllByText('CONFLICT_REFERENCE').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Archive' }).at(-1)!)
    await waitFor(() => expect(screen.queryByText('Model A (model-a)')).toBeNull())
  })

  it('sends an exact update intent and keeps the row when update rejects', async () => {
    const update = vi.fn().mockRejectedValueOnce(new Error('CONFLICT_REFERENCE'))

    const port = {
      list: vi.fn(async () => ({ items: [record()], nextCursor: null })),
      create: vi.fn(),
      update,
      archive: vi.fn()
    } as unknown as ProviderModelMaintenancePort

    renderPage(port)
    await screen.findByText('Model A (model-a)')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const fields = screen.getAllByRole('textbox')
    fireEvent.change(fields[0]!, { target: { value: 'Renamed' } })
    fireEvent.change(fields[1]!, { target: { value: 'model-new' } })
    fireEvent.change(fields[2]!, { target: { value: 'Model New' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        providerModelId: 'pm-1',
        expectedVersion: 2,
        displayName: 'Renamed',
        credentialId: 'cred-1',
        configuration: [{ controlId: 'region', value: 'us' }],
        models: [{ modelId: 'model-new', displayName: 'Model New', availability: 'available', unavailableReason: null }]
      })
    )
    expect(screen.getByRole('alert').textContent).toContain('CONFLICT_REFERENCE')
    expect(screen.getByDisplayValue('Renamed')).toBeTruthy()
  })

  it('creates all model rows with trimmed ids and unknown availability', async () => {
    const create = vi.fn(async (_intent: CreateProviderModelIntent) => record({ id: asWireId('pm-2'), models: [] }))

    const port = {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      create,
      update: vi.fn(),
      archive: vi.fn()
    } as unknown as ProviderModelMaintenancePort

    renderPage(port)
    fireEvent.click(screen.getByRole('button', { name: 'Add model configuration' }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), { target: { value: 'New' } })
    // An empty directory leaves no declared harness, so the explicit override
    // is what a first-run install legitimately uses.
    fireEvent.change(screen.getByRole('combobox', { name: 'Harness' }), { target: { value: '__custom_harness__' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Harness name' }), { target: { value: 'h' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Provider' }), { target: { value: '__custom_provider__' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Provider id' }), { target: { value: 'p' } })
    fireEvent.change(screen.getByLabelText('Model ID'), { target: { value: ' model-a ' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Model name' }), { target: { value: 'Model A' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add model' }))
    fireEvent.change(screen.getAllByLabelText('Model ID')[1]!, { target: { value: 'model-b' } })
    fireEvent.change(screen.getAllByRole('textbox', { name: 'Model name' })[1]!, { target: { value: 'Model B' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const call = create.mock.calls[0]

    if (!call) {
      throw new Error('create was not called')
    }

    expect(call[0].models).toEqual([
      { modelId: 'model-a', displayName: 'Model A', availability: 'unknown', unavailableReason: null },
      { modelId: 'model-b', displayName: 'Model B', availability: 'unknown', unavailableReason: null }
    ])
  })

  it('reopens edit with the normalized record returned by the service', async () => {
    const normalized = record({
      version: 3,
      displayName: 'Service name',
      models: [{ modelId: 'canonical-model', displayName: 'Canonical model', availability: 'unavailable', unavailableReason: 'offline' }]
    })

    const port = {
      list: vi.fn(async () => ({ items: [record()], nextCursor: null })),
      create: vi.fn(),
      update: vi.fn(async () => normalized),
      archive: vi.fn()
    } as unknown as ProviderModelMaintenancePort

    renderPage(port)
    await screen.findByText('Model A (model-a)')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), { target: { value: 'Submitted name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('Service name')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByDisplayValue('Service name')).toBeTruthy()
    expect(screen.getByDisplayValue('canonical-model')).toBeTruthy()
    expect(screen.getByDisplayValue('Canonical model')).toBeTruthy()
  })

  it('updates the central atom only from the returned record and removes archived records', async () => {
    const updated = record({ version: 3, displayName: 'Returned' })
    const archived = record({ archivedAt: '2026-09-14T01:00:00Z' })

    const port = {
      list: vi.fn(async () => ({ items: [record()], nextCursor: null })),
      create: vi.fn(),
      update: vi.fn(async () => updated),
      archive: vi.fn(async () => archived)
    } as unknown as ProviderModelMaintenancePort

    renderPage(port)
    await screen.findByText('Model A (model-a)')
    await waitFor(() => expect($agentBoxProviderModels.get()).toEqual([record()]))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect($agentBoxProviderModels.get()).toEqual([updated]))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Archive' }).at(-1)!)
    await waitFor(() => expect($agentBoxProviderModels.get()).toEqual([]))
  })

  it('blocks duplicate create while saving and restores the form after resolution', async () => {
    let resolveCreate: ((value: ProviderModelConfigRecord) => void) | undefined

    const create = vi.fn(
      () =>
        new Promise<ProviderModelConfigRecord>(resolve => {
          resolveCreate = resolve
        })
    )

    const port = { list: vi.fn(async () => ({ items: [], nextCursor: null })), create, update: vi.fn(), archive: vi.fn() } as unknown as ProviderModelMaintenancePort
    renderPage(port)
    fireEvent.click(screen.getByRole('button', { name: 'Add model configuration' }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), { target: { value: 'New' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Harness' }), { target: { value: '__custom_harness__' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Harness name' }), { target: { value: 'h' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Provider' }), { target: { value: '__custom_provider__' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Provider id' }), { target: { value: 'p' } })
    fireEvent.change(screen.getByLabelText('Model ID'), { target: { value: 'model-a' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Model name' }), { target: { value: 'Model A' } })
    const save = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(create).toHaveBeenCalledTimes(1)
    expect((save as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByRole('textbox').every(input => (input as HTMLInputElement).disabled)).toBe(true)
    resolveCreate?.(record({ id: asWireId('pm-2') }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull())
  })
})

describe('AgentBoxModelSettings credentials', () => {
  it('offers the records the Desktop holds and sends the chosen reference', async () => {
    // Typed so the call's argument is checkable: an untyped `vi.fn()` records
    // calls as `[]` and the assertion below would not compile.
    const update = vi.fn(async (intent: { credentialId: string | null }) => {
      void intent

      return record({ credentialId: asWireId(CREDENTIAL_ID) })
    })

    const port = {
      list: vi.fn(async () => ({ items: [record({ credentialId: null })], nextCursor: null })),
      create: vi.fn(),
      update,
      archive: vi.fn()
    } as unknown as ProviderModelMaintenancePort

    const credentials = {
      add: vi.fn(),
      list: vi.fn(async () => [{ credentialId: CREDENTIAL_ID, kind: 'api-key', label: 'DeepSeek official' }])
    }

    renderPage(port, credentials)
    await screen.findByText('Model A (model-a)')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const picker = await screen.findByRole('combobox', { name: 'Credential reference' })

    // The Desktop's label is what the user chooses by, and the id is what
    // travels: the picker never shows a secret.
    expect(screen.getByRole('option', { name: 'DeepSeek official' })).toBeTruthy()
    fireEvent.change(picker, { target: { value: CREDENTIAL_ID } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0][0].credentialId).toBe(CREDENTIAL_ID)
  })

  it('adds a credential, shows the Server code on refusal, and lists what it added', async () => {
    const port = {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn()
    } as unknown as ProviderModelMaintenancePort

    const add = vi
      .fn()
      .mockResolvedValueOnce({ code: 'CREDENTIAL_SOURCE_UNREADABLE', message: 'nope', ok: false })
      .mockResolvedValueOnce({
        ok: true,
        record: { credentialId: CREDENTIAL_ID, kind: 'api-key', label: 'Work key' }
      })

    const credentials = {
      add,
      list: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValue([{ credentialId: CREDENTIAL_ID, kind: 'api-key', label: 'Work key' }])
    }

    renderPage(port, credentials)
    await screen.findByText('No model configurations')

    fireEvent.click(screen.getByRole('button', { name: 'Add credential' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Work key' } })
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'typed-secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    // The refusal is reported with the Server's own code, not a generic message.
    await screen.findByText(/CREDENTIAL_SOURCE_UNREADABLE/)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(add).toHaveBeenCalledTimes(2))
    expect(add.mock.calls[1][0]).toEqual({ kind: 'api-key', label: 'Work key', secret: 'typed-secret' })
  })
})

// P11: the connection facts the service has not declared are shown as unknown,
// the two service-side actions are disabled WITH their reason, and the only
// credential fact on screen is a reference.
describe('AgentBox model settings honesty', () => {
  it('marks context window and capabilities unknown instead of filling in defaults', async () => {
    const port = {
      list: vi.fn(async () => ({ items: [record()], nextCursor: null })),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn()
    } as unknown as ProviderModelMaintenancePort

    const { container } = renderPage(port)

    expect(await screen.findByText('Model A (model-a)')).toBeTruthy()
    const meta = container.querySelectorAll('[data-model-meta="unknown"]')

    expect(meta.length).toBeGreaterThan(0)
    expect(meta[0]?.textContent).toBe('Context window and capabilities: unknown')
    expect(meta[0]?.getAttribute('title')).toBe('The service has not declared these for this model')
  })

  it('renders the service-side actions disabled with the reason, never as buttons that pretend', async () => {
    const port = {
      list: vi.fn(async () => ({ items: [record()], nextCursor: null })),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn()
    } as unknown as ProviderModelMaintenancePort

    const { container } = renderPage(port)

    await screen.findByText('Model A (model-a)')

    const capabilities = container.querySelector('[data-model-capabilities]')

    expect(capabilities).toBeTruthy()
    for (const name of ['Refresh from provider', 'Test connection']) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement

      expect(button.disabled).toBe(true)
      expect(button.getAttribute('title')).toBe('Unavailable: the service declares no method for this yet.')
    }
    expect(capabilities?.textContent).toContain('Unavailable: the service declares no method for this yet.')
  })

  it('never renders credential material: the row carries a reference and its presence only', async () => {
    const port = {
      list: vi.fn(async () => ({ items: [record({ credentialId: asWireId('cred-1') })], nextCursor: null })),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn()
    } as unknown as ProviderModelMaintenancePort

    const { container } = renderPage(port)

    await screen.findByText('Model A (model-a)')

    expect(container.textContent).toContain('Credential')
    expect(container.textContent).toContain('present')
    // The record itself never carried material; assert nothing secret-shaped rendered.
    expect(container.textContent).not.toMatch(/sk-[A-Za-z0-9]{8,}/)
  })
})
