import { describe, expect, it } from 'vitest'

import { filePathFromMediaPath } from './media'

// `filePathFromMediaPath` is pure — path in, path out, no connection — so it
// belongs with the rest of the pure half in `lib/media.ts`. The remote-mode half
// of media handling lives in `lib/desktop-fs` and is covered by
// `media.remote.test.ts`.
describe('filePathFromMediaPath', () => {
  it('passes through a plain path', () => {
    expect(filePathFromMediaPath('/home/u/.hermes/images/a.png')).toBe('/home/u/.hermes/images/a.png')
  })

  it('decodes a file:// URL with encoded characters', () => {
    expect(filePathFromMediaPath('file:///tmp/a%20b.png')).toBe('/tmp/a b.png')
  })
})

