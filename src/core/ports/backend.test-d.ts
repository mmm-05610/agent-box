/**
 * BackendPorts 类型冒烟（编译期）。
 * vitest 不收集 `.test-d.ts`，本文件由 `tsc --noEmit` 守护：
 * stub 实现能聚合赋给 BackendPorts、成员形状精确一致、
 * 缺成员的对象被拒绝。
 */
import { expectTypeOf } from "vitest"

import type { SessionEvent } from "../domain/session-event"
import type { PermissionRequest } from "../domain/permission"
import type { BackendPorts } from "./backend"
import type { EventChannel } from "./event-channel"
import type { ProjectsPort } from "./projects"
import type { SessionRuntime } from "./session-runtime"
import type { Subscribable } from "./transport"

function subscribable<T>(): Subscribable<T> {
  return { subscribe: () => () => {} }
}

const sessionRuntime: SessionRuntime = {
  connect: async () => {},
  disconnect: async () => {},
  send: async () => {},
  cancel: async () => {},
  events: subscribable<SessionEvent>(),
  permissions: subscribable<PermissionRequest[]>(),
  respondPermission: async () => {},
  restore: async () => ({
    conversationId: "conversation-1",
    status: "completed",
    turns: [],
    pendingPermissions: [],
  }),
}

const projectsPort: ProjectsPort = {
  list: async () => [],
  create: async (input) => ({
    id: "project-1",
    name: input.name,
    origin: input.origin,
    createdAt: "2026-01-01T00:00:00.000Z",
  }),
  update: async (id, patch) => ({
    id,
    name: patch.name ?? "project",
    origin: { kind: "local", path: "/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
    lastActiveSessionId: patch.lastActiveSessionId ?? undefined,
  }),
  remove: async () => {},
  changes: subscribable(),
}

const eventChannel: EventChannel = {
  subscribe: () => () => {},
  publish: () => {},
  onReconnect: () => () => {},
}

const ports: BackendPorts = {
  session: sessionRuntime,
  projects: projectsPort,
  events: eventChannel,
}

expectTypeOf(ports).toEqualTypeOf<BackendPorts>()
expectTypeOf(ports.session).toEqualTypeOf<SessionRuntime>()
expectTypeOf(ports.projects).toEqualTypeOf<ProjectsPort>()
expectTypeOf(ports.events).toEqualTypeOf<EventChannel>()

// @ts-expect-error —— 缺失 events 成员的对象不可赋给 BackendPorts
export const missingEvents: BackendPorts = {
  session: sessionRuntime,
  projects: projectsPort,
}
