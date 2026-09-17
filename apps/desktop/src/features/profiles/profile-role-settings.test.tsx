// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { en } from '@/i18n/en'

import { ProfileRoleSettings } from './profile-role-settings'

afterEach(cleanup)

const copy = en.profiles.roleSettings

const renderSettings = (harness = 'codex') =>
  render(<ProfileRoleSettings copy={copy} displayName="P42 role" harness={harness} maintenanceAvailable={false} modelEditor={<div data-testid="model-editor" />} />)

describe('ProfileRoleSettings', () => {
  it('shows the ownership statement first', () => {
    renderSettings()

    expect(screen.getByText('Sessions belong to a workspace')).toBeTruthy()
    expect(screen.getByText(/it does not own it/)).toBeTruthy()
  })

  it('shows nav entries only for registry-declared slots plus the always-on pair', () => {
    renderSettings('hermes')

    // hermes declares instruction/mcp/skill
    expect(navButton('Instructions')).toBeTruthy()
    expect(navButton('Skills')).toBeTruthy()
    expect(navButton('MCP')).toBeTruthy()
  })

  it('shows the honest unsupported line for an undeclared slot', () => {
    renderSettings('hermes')

    fireEvent.click(screen.getByRole('button', { name: 'Model' }))

    expect(screen.getByText(/does not support/)).toBeTruthy()
    expect(screen.queryByTestId('model-editor')).toBeNull()
  })

  it('shows the model editor for a harness that declares the provider slot', () => {
    renderSettings('codex')

    fireEvent.click(navButton('Model'))

    expect(screen.getByTestId('model-editor')).toBeTruthy()
  })

  it('renders no save/submit/switch control: backend 60 owns the records', () => {
    renderSettings('codex')

    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })
})

function navButton(label: string) {
  return screen.getByRole('button', { name: label })
}
