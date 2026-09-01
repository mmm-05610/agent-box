import { describe, expect, it } from 'vitest'
import { toHomeRelative } from './path'

const HOME = '/home/tester'

describe('toHomeRelative', () => {
  it('maps paths under home to ~-relative', () => {
    expect(toHomeRelative('/home/tester/projects/x', HOME)).toBe('~/projects/x')
    expect(toHomeRelative(`${HOME}`, HOME)).toBe('~')
  })

  it('leaves already ~-relative paths unchanged', () => {
    expect(toHomeRelative('~', HOME)).toBe('~')
    expect(toHomeRelative('~/projects/x', HOME)).toBe('~/projects/x')
  })

  it('leaves paths outside home unchanged', () => {
    expect(toHomeRelative('/mnt/c/Users/maoqh', HOME)).toBe('/mnt/c/Users/maoqh')
    expect(toHomeRelative('\\\\wsl$\\Ubuntu\\home', HOME)).toBe('\\\\wsl$\\Ubuntu\\home')
  })

  it('does not mangle other users homes', () => {
    expect(toHomeRelative('/home/other/x', HOME)).toBe('/home/other/x')
  })

  it('returns empty and unknown paths unchanged', () => {
    expect(toHomeRelative('', HOME)).toBe('')
    expect(toHomeRelative('relative/path', HOME)).toBe('relative/path')
  })

  it('is a no-op without a home value', () => {
    expect(toHomeRelative('/home/tester/x', '')).toBe('/home/tester/x')
  })
})
