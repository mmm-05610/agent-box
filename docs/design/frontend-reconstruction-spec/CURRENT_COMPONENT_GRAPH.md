# Current Studio component graph

## Runtime-to-UI flow

```text
Tauri invoke / Web fetch + WebSocket
  → transport (`src/core/transport`, `src/lib/transport`)
  → session provider/runtime + conversation runtime store
  → SessionEvent / MessageTurn normalization
  → AI Elements adapter (`features/session/model/adapters/ai-elements-adapter.ts`)
  → MessageListView → VirtualizedMessageThread
  → ContentPartsRenderer / part + tool dispatch
  → specialized cards or AgentCapsule
  → composer (`ConversationShell` → `ChatInput` → `MessageInput` → RichComposer)
```

Shell flow is `workspace/layout.tsx → WorkspaceChromeController → TopBar/Sidebar/StatusBar/AuxPanel`, with the main area split into `WorkspaceContent` and the existing bottom `TerminalPanel`. Keep-alive and inert surfaces preserve mounted state.

## AgentCapsule / AgentToolCall / Reasoning / Message / MessageInput

- `MessageListView` groups normalized `MessageTurn`s and renders an AI Elements `Message` wrapper.
- Assistant `CompletedTurnContent` dispatches `AdaptedContentPart`s through `ContentPartsRenderer`.
- `AgentToolCallPart` parses vendor-shaped sub-agent/task payloads, then calls `AgentCapsule`; `CollabAgentCard` also calls `AgentCapsule` for live Codex collaboration.
- `AgentCapsule` owns only local visual open/closed state and running→completed/error transitions; it does not own Session/Execution state. UI-1 changed its completed shell to a flat row, but the name and generic capsule API remain transitional.
- `ReasoningPart` in the large renderer calls `ai-elements/reasoning`; it owns only disclosure timing and streaming display.
- `MessageInput` owns editor draft, attachments, slash/file references, queue edit/send/steer/fork callbacks and selector slots. `ChatInput` composes queue and input; `ConversationShell` supplies runtime callbacks.

## Existing view models and gaps

There are three useful layers, not one unified transcript VM:

1. Domain: `Turn`, `MessagePart`, `ToolCallPart`, `SessionEvent` in `src/core/domain`.
2. Runtime/adapter: `MessageTurn`, `AdaptedMessage`, `AdaptedContentPart`, tool groups, delegation/background groups in `ai-elements-adapter.ts`.
3. Visual-specialized: `AgentCapsule` props, delegation card models, banner-specific props and vendor parsers.

The missing layer is a stable `FlatWorkEntry` discriminated union. `classifyToolKind` provides a partial normalized tool kind, but `isAgentLikeToolName`, vendor suffix regexes, raw names and `meta` still drive rendering branches. This is acceptable at the adapter boundary, not in generic visual components.

## Observation mapping

ACP/harness observations are translated in the session runtime and adapter into text, reasoning, tool-call/result, plan, image, delegation/background groups and errors. Live observations carry richer `meta` and `toolStatus`; persisted rows often lack status and rely on state plus parser heuristics. UI must never infer Harness identity or continuation from a display string; adapters supply explicit `harness`, `executionId`, `status` and `capabilities` when available.

## Duplicate/dead/over-coupled areas

- Three tool skins: `agent-capsule.tsx`, `tool-call-block.tsx`, `ai-elements/tool.tsx`; plus registered vendor cards.
- `content-parts-renderer.tsx` is ~3000 lines and contains dispatch, parsing and visual branches; do not rewrite during a visual phase.
- `part-renderer-dispatch.tsx` and `tool-renderer-dispatch.tsx` are promising registration boundaries but coexist with the large renderer.
- `delegated-sub-thread.tsx`, `delegation-status-group-card.tsx`, `sub-agent-overlay.tsx` are delegation-like but not Execution History.
- `features/agentbox/execution-tree/` is empty; no Execution lineage UI exists.
- `message-bubble.tsx` has no production consumer beyond tests per audit; deletion remains a separately approved maintenance action.
- `subagent-session-dialog.tsx` and `sub-agent-session-dialog.tsx` are duplicate-looking files requiring reference audit.
- TopBar/app-title-bar, Mac detection, settings entry and banner implementations are duplicated per current audit.

## Authority rules

- Session runtime/store owns messages, event sequencing, connection, queue and pending interaction facts.
- Adapter owns vendor-to-canonical display mapping.
- Flat visual components own disclosure, focus and presentation state only.
- Work Core/session plugin owns Execution, branch, checkpoint, continuation and Binding facts.
- Composer never computes continuation; it displays a server/preflight summary.

## UI-1 retained vs residual

Retain: real-route fixture method, virtualized transcript, neutral AgentCapsule completed/running/error states, bodyless non-interactive row, error auto-open, running-to-completed auto-collapse, ScrollArea limits, focus naming and token fallback decisions. Residual cardization: `Tool`, legacy `ToolCallBlock`, plan/permission/delegation/background/task cards, specialized tool cards, user bubble surface, composer rounded chrome, queue/selectors and existing terminal placement. UI-2 must address these incrementally.
