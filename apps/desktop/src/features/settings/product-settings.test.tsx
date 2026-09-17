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
