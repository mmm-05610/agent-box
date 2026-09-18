// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WireRemoteError } from '@/api/wire-v1-client'
import { I18nProvider } from '@/i18n'
import { en } from '@/i18n/en'
import { $agentBoxProfiles, $agentBoxService } from '@/store/agentbox-service'
import { type AccountView, type AssetView, asWireId, type HookView, type ProfileRecord } from '@/types/wire/wire-v1'

import { AgentBoxAccounts } from './agentbox-accounts'
import { AgentBoxAssetHub } from './agentbox-asset-hub'
import { AgentBoxHookSettings } from './agentbox-hook-settings'

afterEach(cleanup)

const copy = en.settings.product

const profile: ProfileRecord = {
  archivedAt: null,
  capabilities: {},
  createdAt: '2026-09-18T00:00:00.000Z',
  displayName: 'Builder',
  harness: 'opaque-alpha',
  id: asWireId('profile_1'),
  updatedAt: '2026-09-18T00:00:00.000Z',
  version: 7
}

const asset: AssetView = {
  assetId: 'fixture-skill',
  createdAt: '2026-09-18T00:00:00.000Z',
  description: null,
  digest: 'sha256:aaaa',
  kind: 'skill',
  latestRevision: 2,
  name: 'Fixture skill',
  source: 'local:fixture',
  updatedAt: '2026-09-18T00:00:00.000Z'
}

const account: AccountView = {
  accountId: asWireId('account_1'),
  accountIdentifier: 'person@example.invalid',
  createdAt: '2026-09-18T00:00:00.000Z',
  harnessType: 'opaque-alpha',
  hasAsset: false,
  lastVerifiedAt: null,
  state: 'ready',
  updatedAt: '2026-09-18T00:00:00.000Z'
}

const hook = (overrides: Partial<HookView> = {}): HookView => ({
  commands: ['/usr/bin/notify "done"'],
  createdAt: '2026-09-18T00:00:00.000Z',
  enabled: false,
  family: 'opencode',
  hookId: asWireId('hook_1'),
  model: { event: 'session_end', handlers: [] },
  name: 'Notifier',
  source: null,
  updatedAt: '2026-09-18T00:00:00.000Z',
  ...overrides
})

const mount = (node: React.ReactElement) =>
  render(<I18nProvider localePreference={null}>{node}</I18nProvider>)

beforeEach(() => {
  $agentBoxService.set({ detail: null, phase: 'ready' })
  $agentBoxProfiles.set([profile])
})

afterEach(() => {
  $agentBoxService.set({ detail: null, phase: 'idle' })
  $agentBoxProfiles.set([])
})

describe('AgentBoxAssetHub (orders 58/59 write paths)', () => {
  it('lists real revisions and binds the asset to the selected role', async () => {
    const bind = vi.fn(async () => ({ assetId: 'fixture-skill', digest: 'sha256:aaaa', enabled: true, kind: 'skill' as const, name: 'Fixture skill', revision: 2 }))

    const port = {
      bind,
      bindings: vi.fn(async () => []),
      list: vi.fn(async () => [asset]),
      publishMcp: vi.fn(),
      publishPlugin: vi.fn(),
      publishSkill: vi.fn(),
      unbind: vi.fn()
    }

    mount(<AgentBoxAssetHub port={port as never} />)

    expect(await screen.findByText('Fixture skill')).toBeTruthy()
    expect(document.querySelector('[data-asset-row="fixture-skill"]')?.textContent).toContain('sha256:aaaa')

    fireEvent.click(screen.getByRole('button', { name: copy.assetHub.bind }))

    await waitFor(() => expect(bind).toHaveBeenCalledWith({ assetId: 'fixture-skill', profileId: 'profile_1' }))
  })

  it('publishes a host path through the skill path and reports the refusal by code', async () => {
    const publishSkill = vi.fn(async () => {
      throw new WireRemoteError({
        code: 'INVALID_REQUEST',
        details: { internalCode: 'SKILL_FRONTMATTER_MISSING' },
        message: 'SKILL.md was not found'
      })
    })

    const port = {
      bind: vi.fn(),
      bindings: vi.fn(async () => []),
      list: vi.fn(async () => []),
      publishMcp: vi.fn(),
      publishPlugin: vi.fn(),
      publishSkill,
      unbind: vi.fn()
    }

    mount(<AgentBoxAssetHub port={port as never} />)
    await screen.findByText(copy.assetHub.empty)

    fireEvent.change(screen.getByLabelText(copy.assetHub.publishAssetId), { target: { value: 'fixture-skill' } })
    fireEvent.change(screen.getByLabelText(copy.assetHub.publishPath), { target: { value: '/tmp/fixture-skill' } })
    fireEvent.click(screen.getByRole('button', { name: copy.assetHub.publishSubmit }))

    const error = await screen.findByText(/SKILL_FRONTMATTER_MISSING/)

    expect(publishSkill).toHaveBeenCalledWith({ assetId: 'fixture-skill', revision: 1, sourcePath: '/tmp/fixture-skill' })
    expect(error.getAttribute('data-asset-hub-error')).toBe('')
    expect(error.textContent).toContain('INVALID_REQUEST')
  })

  it('G2: an unreadable catalogue leaves every write control disabled', async () => {
    const port = {
      bind: vi.fn(),
      bindings: vi.fn(async () => []),
      list: vi.fn(async () => {
        throw new WireRemoteError({ code: 'UNAVAILABLE', message: 'the asset stores are not composed' })
      }),
      publishMcp: vi.fn(),
      publishPlugin: vi.fn(),
      publishSkill: vi.fn(),
      unbind: vi.fn()
    }

    const { container } = mount(<AgentBoxAssetHub port={port as never} />)

    await screen.findByText(/the asset stores are not composed/)
    const buttons = Array.from(container.querySelectorAll('button'))

    expect(buttons.every(button => button.disabled)).toBe(true)
  })
})

describe('AgentBoxAccounts (order 56 write paths)', () => {
  it('creates an account through the contract and shows the reference-only facts', async () => {
    const create = vi.fn(async () => account)
    const port = { bind: vi.fn(), create, importAsset: vi.fn(), list: vi.fn(async () => [account]) }

    mount(<AgentBoxAccounts port={port as never} />)

    expect(await screen.findByText('person@example.invalid')).toBeTruthy()
    expect(document.querySelector('[data-account-asset="false"]')?.textContent).toContain(copy.accountsService.noAsset)
    expect(document.querySelector('[data-account-verified]')).not.toBeNull()

    fireEvent.change(screen.getByLabelText(copy.accountsService.harnessLabel), { target: { value: 'opaque-alpha' } })
    fireEvent.change(screen.getByLabelText(copy.accountsService.identifierLabel), { target: { value: 'other@example.invalid' } })
    fireEvent.click(screen.getByRole('button', { name: copy.accountsService.create }))

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ accountIdentifier: 'other@example.invalid', harness: 'opaque-alpha' })
    )
  })

  it('G2: a deployment without a secret store says so and disables every write', async () => {
    const port = {
      bind: vi.fn(),
      create: vi.fn(),
      importAsset: vi.fn(),
      list: vi.fn(async () => {
        throw new WireRemoteError({
          code: 'UNAVAILABLE',
          message: 'managed subscription accounts need a platform secret store'
        })
      })
    }

    const { container } = mount(<AgentBoxAccounts port={port as never} />)

    await screen.findByText(/need a platform secret store/)
    expect(container.querySelector('[data-accounts-failure]')).not.toBeNull()
    expect(Array.from(container.querySelectorAll('button')).every(button => button.disabled)).toBe(true)
  })
})

describe('AgentBoxHookSettings (order 59 write paths)', () => {
  it('shows the exact commands a hook would run, and enables it explicitly', async () => {
    const setEnabled = vi.fn(async () => hook({ enabled: true }))

    const port = {
      create: vi.fn(),
      list: vi.fn(async () => [hook()]),
      remove: vi.fn(),
      setEnabled,
      triggers: vi.fn(async () => [])
    }

    mount(<AgentBoxHookSettings port={port as never} />)

    expect(await screen.findByText('/usr/bin/notify "done"')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: copy.hookSettings.enable }))

    await waitFor(() => expect(setEnabled).toHaveBeenCalledWith({ enabled: true, hookId: 'hook_1' }))
  })

  it('a hook with no command handler cannot be enabled — the switch is disabled with the reason', async () => {
    const port = {
      create: vi.fn(),
      list: vi.fn(async () => [hook({ commands: [] })]),
      remove: vi.fn(),
      setEnabled: vi.fn(),
      triggers: vi.fn(async () => [])
    }

    mount(<AgentBoxHookSettings port={port as never} />)

    const enable = await screen.findByRole('button', { name: copy.hookSettings.enable })

    expect(enable.hasAttribute('disabled')).toBe(true)
    expect(document.querySelector('[data-hook-not-executable]')?.textContent).toContain(copy.hookSettings.notExecutable)
  })

  it('creates a hook as a command handler model, and reports how many triggers a delete took', async () => {
    const create = vi.fn(async () => hook())
    const remove = vi.fn(async () => ({ deleted: true, triggersRemoved: 3 }))
    const port = { create, list: vi.fn(async () => [hook()]), remove, setEnabled: vi.fn(), triggers: vi.fn(async () => []) }

    mount(<AgentBoxHookSettings port={port as never} />)
    await screen.findByText('/usr/bin/notify "done"')

    fireEvent.change(screen.getByLabelText(copy.hookSettings.createFamily), { target: { value: 'opencode' } })
    fireEvent.change(screen.getByLabelText(copy.hookSettings.createName), { target: { value: 'Bell' } })
    fireEvent.change(screen.getByLabelText(copy.hookSettings.createEvent), { target: { value: 'session_end' } })
    fireEvent.change(screen.getByLabelText(copy.hookSettings.createCommand), { target: { value: '/usr/bin/true' } })
    fireEvent.click(screen.getByRole('button', { name: copy.hookSettings.create }))

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        family: 'opencode',
        model: { event: 'session_end', handlers: [{ async: false, command: '/usr/bin/true', timeout: 30, type: 'command' }] },
        name: 'Bell'
      })
    )

    fireEvent.click(screen.getByRole('button', { name: copy.hookSettings.remove }))

    // The confirmation is its own dialog: the row's button must not double as it.
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: copy.hookSettings.remove }))

    await waitFor(() => expect(remove).toHaveBeenCalledWith('hook_1'))
    expect(await screen.findByText(copy.hookSettings.removed(3))).toBeTruthy()
  })
})
