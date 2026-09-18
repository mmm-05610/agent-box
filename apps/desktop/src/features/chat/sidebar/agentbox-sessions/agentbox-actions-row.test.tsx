// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { stubMenuDomApis } from '@/dev/test/jsdom'

import { AgentBoxActionsRow } from './agentbox-actions-row'

stubMenuDomApis()

afterEach(cleanup)

const labels = { newTask: 'New task', search: 'Search' }

describe('AgentBoxActionsRow', () => {
  it('offers exactly the two doors, named', () => {
    render(<AgentBoxActionsRow labels={labels} onNewTask={vi.fn()} onSearch={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'New task' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy()
  })

  it('walks the existing new-session path when New task is pressed', () => {
    const onNewTask = vi.fn()
    render(<AgentBoxActionsRow labels={labels} onNewTask={onNewTask} onSearch={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'New task' }))

    expect(onNewTask).toHaveBeenCalledTimes(1)
  })

  it('opens the existing command palette when Search is pressed', () => {
    const onSearch = vi.fn()
    render(<AgentBoxActionsRow labels={labels} onNewTask={vi.fn()} onSearch={onSearch} />)

    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(onSearch).toHaveBeenCalledTimes(1)
  })
})
