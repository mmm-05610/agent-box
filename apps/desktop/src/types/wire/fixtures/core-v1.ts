import {
  type ApprovalRequest,
  asCursor,
  asRequestId,
  asWireId,
  type EventFrame,
  type ProfileRecord,
  type SessionRecord,
  type WorkspaceRecord
} from '../wire-v1'

export const fixtureTime = '2026-09-14T00:00:00.000Z'

export const localWorkspace = {
  id: asWireId('workspace-local'),
  version: 1,
  displayName: 'Local project',
  normalizedPath: '/shared/project',
  environment: { kind: 'local', host: null, user: 'tester' },
  accessibility: { readable: true, writable: true, executableForRole: null, reasons: [] },
  connection: { state: 'connected' },
  archivedAt: null,
  createdAt: fixtureTime,
  updatedAt: fixtureTime
} satisfies WorkspaceRecord

export const wslWorkspace = {
  ...localWorkspace,
  id: asWireId('workspace-wsl'),
  displayName: 'WSL project',
  environment: { kind: 'wsl', host: 'Ubuntu', user: 'tester' }
} satisfies WorkspaceRecord

export const profile = {
  id: asWireId('profile-alpha'),
  version: 2,
  displayName: 'Reviewer',
  harness: 'opaque-harness-name',
  capabilities: {},
  archivedAt: null,
  createdAt: fixtureTime,
  updatedAt: fixtureTime
} satisfies ProfileRecord

export const session = {
  id: asWireId('session-1'),
  version: 4,
  workspaceId: localWorkspace.id,
  profileId: profile.id,
  displayName: 'Fix the race',
  pinned: false,
  archivedAt: null,
  createdAt: fixtureTime,
  updatedAt: fixtureTime
} satisfies SessionRecord

export const approval = {
  approvalId: asWireId('approval-1'),
  sessionId: session.id,
  executionId: asWireId('execution-1'),
  version: 3,
  operation: {
    title: 'Write file',
    detail: [{ label: 'target', value: '/shared/project/src/app.ts' }],
    tool: 'write_file'
  },
  expiresAt: null
} satisfies ApprovalRequest

export function frame(
  eventId: string,
  seq: number,
  event: EventFrame['event'],
  cursor = `cursor-${seq}`
): EventFrame {
  return {
    eventId: asWireId(eventId),
    sessionId: session.id,
    seq,
    cursor: asCursor(cursor),
    emittedAt: fixtureTime,
    event
  }
}

/** Traceable §9 fixture inventory; executable assertions live beside it. */
export const CORE_V1_FIXTURE_MATRIX = [
  { id: '01-unavailable', covers: 1, title: 'Unavailable service and honest capability degradation' },
  { id: '02-workspace-identity', covers: 2, title: 'Environment-qualified workspace identity and reopen' },
  { id: '03-send-idempotency', covers: 3, title: 'Atomic first send, replay, conflict, and unknown outcome' },
  { id: '04-config-freeze', covers: 4, title: 'Profile conflict and queued configuration freeze' },
  { id: '05-stop-queue', covers: 5, title: 'Stop request, terminal confirmation, and paused queue' },
  { id: '06-approval-race', covers: 6, title: 'Approval race, invalidation, and presentation-only replay' },
  { id: '07-snapshot-join', covers: 7, title: 'Snapshot join, event dedupe, gap, and resync' },
  { id: '08-reconnect', covers: 8, title: 'Reconnect reads history without redispatch' },
  { id: '09-secret-boundary', covers: 9, title: 'Remote references and events contain no secret material' }
] as const

export const createAndSendParams = {
  requestId: asRequestId('request-create-send-0001'),
  workspaceId: localWorkspace.id,
  profileId: profile.id,
  overrides: [{ controlId: 'model', value: 'alpha-fast' }],
  message: { text: 'Fix the race', attachments: [] }
}
