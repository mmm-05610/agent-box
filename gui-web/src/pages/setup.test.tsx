// @vitest-environment jsdom
/**
 * SetupScreen — WSL install guide rendered by EnvironmentGate when the
 * backend isn't usable. Verifies both failure states, the retry action,
 * and the collapsed technical-detail block.
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SetupScreen } from './setup'

afterEach(cleanup)

const status = (over: Partial<{ ready: boolean; wsl: boolean; distro: boolean; detail: string }> = {}) => ({
  ready: false,
  wsl: false,
  distro: false,
  detail: '',
  ...over,
})

describe('SetupScreen', () => {
  it('shows the WSL install guide when wsl.exe is missing', () => {
    render(
      <SetupScreen
        status={status({ detail: 'wsl.exe not found in PATH' })}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getAllByText('未检测到 WSL2（wsl.exe）').length).toBeGreaterThan(0)
    expect(screen.getAllByText('wsl --install -d Ubuntu').length).toBeGreaterThan(0)
  })

  it('shows the missing-distribution state when WSL exists but no distro', () => {
    render(
      <SetupScreen
        status={status({ wsl: true, detail: 'no installed distributions' })}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getAllByText('已检测到 WSL2，但没有安装任何 Linux 发行版').length).toBeGreaterThan(0)
  })

  it('triggers onRetry when "重新检测" is clicked', () => {
    const onRetry = vi.fn()
    render(<SetupScreen status={status()} onRetry={onRetry} />)
    screen.getByText('重新检测').click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('hides the technical-detail block when detail is empty', () => {
    render(<SetupScreen status={status()} onRetry={vi.fn()} />)
    expect(screen.queryByText('技术细节')).toBeNull()
  })

  it('shows the technical-detail block when detail is present', () => {
    render(
      <SetupScreen
        status={status({ wsl: true, detail: 'wsl command failed (exit 4294967295)' })}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getAllByText('技术细节').length).toBeGreaterThan(0)
  })
})
