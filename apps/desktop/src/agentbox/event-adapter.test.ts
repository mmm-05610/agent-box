import { describe, expect, it } from 'vitest'

import { foldAgentBoxEvent, projectAgentBoxTranscript } from './event-adapter'
import type { AgentBoxEvent } from './types'
import type { AgentBoxTurnProjection } from './event-adapter'

const TURN = 'turn_1'

function event(seq: number, event_type: string, payload: Record<string, unknown>, options: { turnId?: string | null; terminal?: boolean } = {}): AgentBoxEvent {
  return {
    seq,
    event_id: `e${seq}`,
    event_type,
    turn_id: options.turnId === undefined ? TURN : options.turnId,
    execution_id: null,
    payload,
    terminal: options.terminal ?? false,
    created_at: '2026-09-10T00:00:00Z'
  }
}

const EMPTY: AgentBoxTurnProjection = { messages: [], watermark: 0, turnRunning: false }

describe('AgentBox → ChatMessage projection', () => {
  it('renders one user bubble + one pending assistant bubble per TURN_STARTED', () => {
    const projection = foldAgentBoxEvent(EMPTY, event(1, 'TURN_STARTED', { input: 'hello synthetic' }))

    expect(projection.messages).toHaveLength(2)
    expect(projection.messages[0]).toMatchObject({ role: 'user', pending: false })
    expect(projection.messages[0].parts[0]).toMatchObject({ type: 'text', text: 'hello synthetic' })
    expect(projection.messages[1]).toMatchObject({ role: 'assistant', pending: true })
    expect(projection.turnRunning).toBe(true)
    expect(projection.watermark).toBe(1)
  })

  it('appends assistant text and settles the turn on TURN_TERMINAL success', () => {
    let projection = foldAgentBoxEvent(EMPTY, event(1, 'TURN_STARTED', { input: 'q' }))
    projection = foldAgentBoxEvent(projection, event(2, 'assistant.message', { text: '[fake] acknowledged: q' }))
    projection = foldAgentBoxEvent(projection, event(3, 'TURN_TERMINAL', { outcome: 'succeeded' }, { terminal: true }))

    const assistant = projection.messages[1]

    expect(assistant.pending).toBe(false)
    expect(assistant.error).toBeUndefined()
    expect(assistant.parts.some(part => part.type === 'text' && (part as { text: string }).text.includes('[fake]'))).toBe(true)
    expect(projection.turnRunning).toBe(false)
  })

  it('surfaces a failed terminal outcome as a real error on the assistant message', () => {
    let projection = foldAgentBoxEvent(EMPTY, event(1, 'TURN_STARTED', { input: 'q' }))
    projection = foldAgentBoxEvent(projection, event(2, 'TURN_TERMINAL', { outcome: 'failed' }, { terminal: true }))

    expect(projection.messages[1].error).toBe('turn failed')
    expect(projection.turnRunning).toBe(false)
  })

  it('maps workspace observations and turn results to tool-call parts', () => {
    let projection = foldAgentBoxEvent(EMPTY, event(1, 'TURN_STARTED', { input: 'q' }))
    projection = foldAgentBoxEvent(
      projection,
      event(2, 'workspace.observation', { detail: 'fake execution observed the live root without modifying it' })
    )
    projection = foldAgentBoxEvent(projection, event(3, 'turn.result', { outcome: 'succeeded', note: 'deterministic fake vertical' }))

    const parts = projection.messages[1].parts

    expect(parts.filter(part => part.type === 'tool-call')).toHaveLength(2)
  })

  it('ignores replayed events at or below the watermark (replay/live overlap dedupe)', () => {
    const base = foldAgentBoxEvent(EMPTY, event(1, 'TURN_STARTED', { input: 'q' }))
    const duplicate = foldAgentBoxEvent(base, event(1, 'TURN_STARTED', { input: 'q' }))

    expect(duplicate).toBe(base)
    expect(duplicate.messages).toHaveLength(2)
  })

  it('projects a full transcript fetch in order (hydration path)', () => {
    const transcript = {
      session_id: 'sess_1',
      watermark: 4,
      events: [
        event(1, 'SESSION_CREATED', {}, { turnId: null }),
        event(2, 'TURN_STARTED', { input: 'q' }),
        event(3, 'assistant.message', { text: 'a' }),
        event(4, 'TURN_TERMINAL', { outcome: 'succeeded' }, { terminal: true })
      ],
      turns: [{ turn_id: TURN, input: 'q', assistant_text: 'a', status: 'succeeded' }]
    }

    const projection = projectAgentBoxTranscript(transcript)

    expect(projection.messages).toHaveLength(2)
    expect(projection.watermark).toBe(4)
    expect(projection.turnRunning).toBe(false)
  })

  it('keeps pure-fold discipline: the input projection is never mutated', () => {
    const base = foldAgentBoxEvent(EMPTY, event(1, 'TURN_STARTED', { input: 'q' }))
    const messagesSnapshot = [...base.messages]

    foldAgentBoxEvent(base, event(2, 'assistant.message', { text: 'a' }))

    expect(base.messages).toHaveLength(2)
    expect(base.messages).toEqual(messagesSnapshot)
  })
})
