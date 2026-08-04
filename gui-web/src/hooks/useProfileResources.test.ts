// @vitest-environment jsdom
/**
 * useProfileResources tests — per-profile reload semantics (Stage 6).
 *
 * Verifies the object domain reloads when profileName changes, refresh()
 * refetches after writes, and the installed-skills scan feeds the skills
 * slice (moved here from SkillList).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useProfileResources } from './useProfileResources'

const mocks = vi.hoisted(() => ({
  fetchProfileProviders: vi.fn(),
  fetchProfileMcp: vi.fn(),
  fetchProfileDetail: vi.fn(),
  findFiles: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock('@/api', () => ({
  fetchProfileProviders: mocks.fetchProfileProviders,
  fetchProfileMcp: mocks.fetchProfileMcp,
  fetchProfileDetail: mocks.fetchProfileDetail,
}))

vi.mock('@/api/files', () => ({
  findFiles: mocks.findFiles,
  readFile: mocks.readFile,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function mockProfile(profileName: string) {
  mocks.fetchProfileProviders.mockResolvedValue([{ id: `${profileName}-p`, name: `P ${profileName}`, settings: {} }])
  mocks.fetchProfileMcp.mockResolvedValue([{ id: `${profileName}-m`, name: `MCP ${profileName}`, raw: {} }])
  mocks.fetchProfileDetail.mockResolvedValue({ config_dir: `/profiles/${profileName}` })
  mocks.findFiles.mockResolvedValue([])
}

describe('useProfileResources', () => {
  it('loads installed providers + mcp and reloads when profileName changes', async () => {
    mockProfile('prof-a')

    const { result, rerender } = renderHook(
      ({ name }: { name: string }) => useProfileResources(name),
      { initialProps: { name: 'prof-a' } },
    )

    await waitFor(() => expect(mocks.fetchProfileProviders).toHaveBeenCalledWith('prof-a'))
    expect(mocks.fetchProfileMcp).toHaveBeenCalledWith('prof-a')
    await waitFor(() => expect(result.current.providers[0]?.id).toBe('prof-a-p'))
    expect(result.current.mcp[0]?.id).toBe('prof-a-m')

    mockProfile('prof-b')
    rerender({ name: 'prof-b' })

    await waitFor(() => expect(mocks.fetchProfileProviders).toHaveBeenCalledWith('prof-b'))
    expect(mocks.fetchProfileMcp).toHaveBeenCalledWith('prof-b')
    await waitFor(() => expect(result.current.providers[0]?.id).toBe('prof-b-p'))
    expect(result.current.mcp[0]?.id).toBe('prof-b-m')
  })

  it('refresh() reloads the per-profile data', async () => {
    mockProfile('prof-a')

    const { result } = renderHook(() => useProfileResources('prof-a'))
    await waitFor(() => expect(mocks.fetchProfileProviders).toHaveBeenCalledTimes(1))
    expect(mocks.fetchProfileMcp).toHaveBeenCalledTimes(1)

    mockProfile('prof-a')
    act(() => result.current.refresh())
    await waitFor(() => expect(mocks.fetchProfileProviders).toHaveBeenCalledTimes(2))
    expect(mocks.fetchProfileMcp).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(result.current.providers[0]?.id).toBe('prof-a-p'))
  })

  it('scans installed skills when includeSkills is set', async () => {
    mocks.fetchProfileProviders.mockResolvedValue([])
    mocks.fetchProfileMcp.mockResolvedValue([])
    mocks.fetchProfileDetail.mockResolvedValue({ config_dir: '/profiles/a' })
    mocks.findFiles.mockResolvedValue(['/profiles/a/skills/myskill/SKILL.md'])
    mocks.readFile.mockResolvedValue('---\nname: My Skill\ndescription: Does things\n---\n\nBody')

    const { result } = renderHook(() => useProfileResources('prof-a', { includeSkills: true, skillsDirName: 'skills' }))

    await waitFor(() => expect(result.current.skills.length).toBe(1))
    expect(result.current.skills[0]?.id).toBe('myskill')
    expect(result.current.skills[0]?.name).toBe('My Skill')
    expect(result.current.skills[0]?.frontmatter.description).toBe('Does things')
    expect(mocks.findFiles).toHaveBeenCalledWith('/profiles/a/skills')
    expect(mocks.readFile).toHaveBeenCalledWith('/profiles/a/skills/myskill/SKILL.md')
  })
})
