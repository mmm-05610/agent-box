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
