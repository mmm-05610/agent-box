import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ProductSettings } from './product-settings'

afterEach(cleanup)

describe('ProductSettings', () => {
  it('states the unavailable boundary without rendering a fake action', () => {
    render(<ProductSettings view="harnesses" />)

    expect(screen.getByText('Harnesses')).toBeTruthy()
    expect(screen.getByText('Not available yet')).toBeTruthy()
    expect(screen.getByText(/this computer only/i)).toBeTruthy()
    expect(screen.getByText(/Workspace connections and remote targets stay with each Workspace/i)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('distinguishes application backup from credentials and project files', () => {
    render(<ProductSettings view="data" />)

    expect(screen.getByText(/sessions, drafts, Profile memory/i)).toBeTruthy()
    expect(screen.getByText(/Credentials, project files, and downloadable tools are excluded/i)).toBeTruthy()
  })
})

// P13: the harness program directory belongs to the service (57). Until it
// declares one, the surface names the fields it will carry and says outright
// that nothing is being guessed — and renders no row, no version and no
// action that could not run.
describe('ProductSettings harness program plan', () => {
  it('names the fields a program row will carry, and says the directory is missing', () => {
    const { container } = render(<ProductSettings view="harnesses" />)

    const plan = container.querySelector('[data-harness-program-plan]')

    expect(plan).toBeTruthy()
    expect(plan?.textContent).toContain('The program directory is not available')

    for (const field of ['Current version', 'Other installed versions', 'Size', 'Source', 'Installed at', 'Update badge']) {
      expect(plan?.textContent).toContain(field)
    }

    expect(plan?.textContent).toContain('Nothing is guessed in the meantime')
  })

  it('shows the next-turn meaning of a version change', () => {
    render(<ProductSettings view="harnesses" />)

    expect(screen.getByText(/takes effect on the next turn/)).toBeTruthy()
    expect(screen.getByText(/keeps the version it started with/)).toBeTruthy()
  })

  it('renders no program data and no action: no version, no size, no install button', () => {
    const { container } = render(<ProductSettings view="harnesses" />)

    expect(screen.queryByRole('button')).toBeNull()
    // No version-shaped or size-shaped values anywhere on the page.
    expect(container.textContent).not.toMatch(/\bv?\d+\.\d+\.\d+\b/)
    expect(container.textContent).not.toMatch(/\b\d+(\.\d+)?\s?(MB|GB)\b/)
  })

  it('keeps the plan off the other product views', () => {
    const { container } = render(<ProductSettings view="data" />)

    expect(container.querySelector('[data-harness-program-plan]')).toBeNull()
  })
})

// P15-B/C: the skill library and MCP server list belong to the service (58).
// Until it declares them this surface names their fields, states what is
// missing, and holds the line that matters most here: a credential is only
// ever a reference, and no switch or test button exists before it could work.
// P22: these two views stopped being "the fields this will carry" and became
// the faces themselves (orders 58/59). What still matters here — and what the
// old plan copy was protecting — is that a surface without a service can be
// neither read nor written: it says why, and every write control is disabled.
describe('ProductSettings asset hub (P22, order 58/59 write path)', () => {
  it('renders the catalogue surface with the service state named, never a fabricated list', () => {
    const { container } = render(<ProductSettings view="resources" />)

    expect(container.querySelector('[data-asset-hub-offline]')).not.toBeNull()
    expect(container.textContent).not.toMatch(/sha256:[0-9a-f]{6,}/i)
  })

  it('G2: with no readable catalogue every write control is disabled', () => {
    const { container } = render(<ProductSettings view="resources" />)
    const buttons = Array.from(container.querySelectorAll('button'))

    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons.every(button => button.disabled)).toBe(true)
  })

  it('states what a published revision keeps (provenance) before anything is published', () => {
    render(<ProductSettings view="resources" />)

    expect(screen.getByText(/keeps its provenance/i)).toBeTruthy()
  })
})

describe('ProductSettings hook surface (P22, order 59 write path)', () => {
  it('renders the hook surface with its state named', () => {
    const { container } = render(<ProductSettings view="hooks" />)

    expect(container.querySelector('[data-hooks-offline]')).not.toBeNull()
  })

  it('G2: with no readable ledger no hook control is enabled', () => {
    const { container } = render(<ProductSettings view="hooks" />)
    const buttons = Array.from(container.querySelectorAll('button'))

    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons.every(button => button.disabled)).toBe(true)
  })

  it('says a hook starts disabled and that the service owns the family schema', () => {
    render(<ProductSettings view="hooks" />)

    expect(screen.getByText(/validates the event and handler against the declared schema/i)).toBeTruthy()
  })
})

describe('ProductSettings accounts surface (P22, order 56 write path)', () => {
  it('renders the service-account surface with its state named, not the local credential file', () => {
    const { container } = render(<ProductSettings view="identities" />)

    expect(container.querySelector('[data-accounts-offline]')).not.toBeNull()
    expect(screen.getByText(/Only references cross this surface/i)).toBeTruthy()
  })
})
