import { describe, expect, it } from 'vitest'

import { WireProtocolError, WireRemoteError } from '@/api/wire-v1-client'

import { wireErrorText } from './wire-error-text'

describe('wireErrorText', () => {
  it('leads with the family and appends the precise internal code', () => {
    const error = new WireRemoteError({
      code: 'INVALID_REQUEST',
      details: { internalCode: 'PERMISSION_PRESET_UNSUPPORTED' },
      message: "'nope' is not a preset (declared: ['default', 'full-plan', 'plan'])"
    })

    expect(wireErrorText(error)).toBe(
      "INVALID_REQUEST: 'nope' is not a preset (declared: ['default', 'full-plan', 'plan']) [PERMISSION_PRESET_UNSUPPORTED]"
    )
  })

  it('does not invent a bracket when the service sent no internal code', () => {
    const error = new WireRemoteError({ code: 'UNAVAILABLE', message: 'the hook ledger is not composed' })

    expect(wireErrorText(error)).toBe('UNAVAILABLE: the hook ledger is not composed')
  })

  it('passes a local failure through instead of dressing it as a service answer', () => {
    expect(wireErrorText(new WireProtocolError('Invalid assets.bind parameters'))).toBe('Invalid assets.bind parameters')
    expect(wireErrorText(new Error('boom'))).toBe('boom')
    expect(wireErrorText('not an error')).toBe('not an error')
  })
})
