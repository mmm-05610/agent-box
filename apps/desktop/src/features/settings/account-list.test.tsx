import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n'

import { accountKindLabel, AccountList } from './account-list'

afterEach(cleanup)

const renderList = (records: { credentialId: string; kind: string; label: string }[]) =>
  render(
    <I18nProvider localePreference={null}>
      <AccountList records={records} />
    </I18nProvider>
  )

describe('AccountList', () => {
  it('shows a subscription and an API key as two peers of the same kind of record', () => {
    const { container } = renderList([
      { credentialId: 'cred-sub', kind: 'subscription', label: 'Work login' },
      { credentialId: 'cred-key', kind: 'api-key', label: 'Team key' }
    ])

    expect(screen.getByText('Work login')).toBeTruthy()
    expect(screen.getByText('Team key')).toBeTruthy()
    expect(container.querySelector('[data-account-kind="subscription"]')?.textContent).toContain(
      'Subscription (official login)'
    )
    expect(container.querySelector('[data-account-kind="api-key"]')?.textContent).toContain('API key')
  })

  it('reports status as unknown, never as a placeholder valid', () => {
    const { container } = renderList([{ credentialId: 'cred-sub', kind: 'subscription', label: 'Work login' }])

    expect(container.querySelector('[data-account-verified="unknown"]')).toBeTruthy()
    expect(container.textContent).toContain('Status unknown')
    expect(container.textContent).toContain('Last verified: unknown')
    expect(container.textContent).not.toMatch(/valid|active|expired/i)
  })

  it('shows the login guidance and the next-turn meaning of a switch', () => {
    const { container } = renderList([])

    const guidance = container.querySelector('[data-account-guidance]')?.textContent ?? ''

    expect(guidance).toContain('Sign in on the execution side')
    expect(guidance).toContain('never asks for account credentials')
    expect(guidance).toContain('next turn')
  })

  it('keeps an unknown kind as the service’s own string instead of forcing it into a family', () => {
    const copy = { kindApiKey: 'API key', kindSubscription: 'Subscription (official login)' } as never

    expect(accountKindLabel('api-key', copy)).toBe('API key')
    expect(accountKindLabel('subscription', copy)).toBe('Subscription (official login)')
    expect(accountKindLabel('oauth-device', copy)).toBe('oauth-device')
  })

  it('renders no credential material — records carry an id, a kind and a label only', () => {
    const { container } = renderList([{ credentialId: 'cred-key', kind: 'api-key', label: 'Team key' }])

    expect(container.textContent).not.toMatch(/sk-[A-Za-z0-9]{8,}/)
    expect(container.textContent).not.toMatch(/Bearer\s/)
  })
})
