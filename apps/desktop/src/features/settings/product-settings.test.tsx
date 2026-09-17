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
describe('ProductSettings skill and MCP hubs', () => {
  it('names both lists' + "'" + ' fields and says each library is missing', () => {
    const { container } = render(<ProductSettings view="resources" />)

    const skill = container.querySelector('[data-skill-plan]')
    const mcp = container.querySelector('[data-mcp-plan]')

    expect(skill?.textContent).toContain('The skill library is not available')
    for (const field of ['SKILL.md', 'Source', 'Digest / revision', 'Enabled per profile']) {
      expect(skill?.textContent).toContain(field)
    }
    expect(mcp?.textContent).toContain('The MCP server list is not available')
    for (const field of ['Transport (stdio or remote)', 'Command or URL', 'Credential reference']) {
      expect(mcp?.textContent).toContain(field)
    }
  })

  it('promises credential references only, and no test button before one can run', () => {
    const { container } = render(<ProductSettings view="resources" />)

    const mcp = container.querySelector('[data-mcp-plan]')?.textContent ?? ''

    expect(mcp).toContain('never its value')
    expect(mcp).toContain('no test button exists until the service can run one')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('states the per-profile enablement rule, including the absent-slot case', () => {
    const { container } = render(<ProductSettings view="resources" />)

    expect(container.querySelector('[data-resource-enablement-rule]')?.textContent).toContain(
      'a family without a slot for a resource says so'
    )
  })

  it('renders no installed state, digest or update badge for either list', () => {
    const { container } = render(<ProductSettings view="resources" />)

    expect(container.textContent).not.toMatch(/\bv?\d+\.\d+\.\d+\b/)
    expect(container.textContent).not.toMatch(/sha256|sk-[A-Za-z0-9]{6,}/i)
  })
})
