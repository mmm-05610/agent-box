// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n'
import { asWireId } from '@/types/wire/wire-v1'

import { ComposerAccessChip } from './access-chip'

afterEach(cleanup)

const baseDescriptor = (controls: { controlId: string; editable: boolean; kind: 'enum'; values: string[] }[]) => ({
  controls,
  effectTiming: 'next_send' as const,
  profileId: asWireId('profile-1') as unknown as string,
  securityLockedIds: [] as string[],
  workspaceId: asWireId('workspace-1') as unknown as string
})

describe('ComposerAccessChip', () => {
  it('renders a select when the service declares a permission control', () => {
    const { container } = render(
      <I18nProvider localePreference={null}>
        <ComposerAccessChip
          profile={{
            configDescriptor: baseDescriptor([
              { controlId: 'permission', editable: true, kind: 'enum', values: ['default', 'full'] }
            ]),
            onOverrideChange: () => {},
            onSelect: () => true,
            options: [],
            overrides: [],
            selectedId: 'p1'
          }}
        />
      </I18nProvider>
    )
    expect(container.querySelector('[aria-label="Access mode"]')).toBeTruthy()
  })

  it('renders nothing when no permission control is declared', () => {
    const { container } = render(
      <I18nProvider localePreference={null}>
        <ComposerAccessChip
          profile={{
            configDescriptor: baseDescriptor([]),
            onOverrideChange: () => {},
            onSelect: () => true,
            options: [],
            overrides: [],
            selectedId: 'p1'
          }}
        />
      </I18nProvider>
    )
    expect(container.querySelector('[aria-label="Access mode"]')).toBeNull()
  })
})
