# Recommended component architecture

## Tree

```text
ConversationShell
└─ WorkTranscript (virtualized adapter boundary)
   └─ TranscriptEntry
      ├─ AssistantProse / UserEntry
      ├─ WorkEventRow
      │  ├─ WorkEventHeader + WorkEventStatus
      │  └─ WorkEventDetails
      │     ├─ CommandDetails / FileChangeDetails / ReasoningDetails
      │     ├─ DecisionBlock / PermissionBlock / FailureBlock
      │     └─ ContinuationNotice
      └─ StreamingPlaceholder / QueuedInput
ConversationShell
└─ Composer
   └─ ComposerContextSummary
```

## View model

```ts
type WorkStatus = "streaming" | "running" | "awaiting-decision" | "completed" | "recoverable-error" | "fatal-error" | "queued"
type WorkEntry =
  | { kind: "assistant-prose"; id: string; markdown: string; status: Extract<WorkStatus, "streaming" | "completed">; harness?: HarnessIdentity; copyText: string }
  | { kind: "user-message"; id: string; text: string; attachments: AttachmentRef[]; status: "completed"; copyText: string }
  | { kind: "thinking"; id: string; text: string; status: "streaming" | "completed"; interactive: true }
  | { kind: "tool"; id: string; tool: ToolKind; summary: string; status: Exclude<WorkStatus, "queued">; details?: ToolDetails; recovery?: RecoveryAction }
  | { kind: "delegation"; id: string; executionId: string; taskId: string; summary: string; status: WorkStatus; childSessionId?: string }
  | { kind: "decision"; id: string; decision: "permission" | "question"; prompt: string; options: DecisionOption[]; status: "awaiting-decision" | "completed" | "recoverable-error" }
  | { kind: "failure"; id: string; severity: "recoverable" | "fatal"; message: string; recovery?: RecoveryAction; status: "recoverable-error" | "fatal-error" | "completed" }
  | { kind: "continuation"; id: string; summary: Readonly<ContinuationSummary>; status: "completed" }
  | { kind: "diagnostic" | "warning" | "streaming-placeholder" | "queued-input"; id: string; summary: string; status: WorkStatus; details?: string }
```

`HarnessIdentity`, `ContinuationSummary`, `DecisionOption`, `RecoveryAction`, `ToolDetails` and `AttachmentRef` are adapter-owned types. `ContinuationSummary` is read-only and must include the server-provided mode, parent ref, compatibility and optional Loss Report; it must not expose a `continue` input.

## Ownership

- `WorkTranscript` receives an ordered `WorkEntry[]` and a scroll/virtualization adapter. It owns no domain state.
- `TranscriptEntry` pattern-matches `kind`; it never parses raw vendor payloads.
- `WorkEventHeader` renders identity/status/disclosure only. `WorkEventDetails` renders content; it does not decide status.
- `DecisionBlock` calls a supplied action and reports pending/error; authority decides whether the action is allowed.
- `FailureBlock` renders supplied recovery actions; it cannot retry by inspecting an error string.
- `Composer` owns editor presentation and calls existing `onSend`, `onCancel`, `onEnqueue`, `onSteer`, `onForkSend` callbacks. It does not write Session/Execution state.
- `ComposerContextSummary` displays profile/model/harness/context and Binding/preflight facts from props.

Prefer children/compound composition (`WorkEventRow.Header`, `.Details`, `.Status`) over boolean prop accumulation. Use explicit variants such as `details: { type: "command", ... }`, not `isCommand`, `isError`, `isRunning`, `showBody` combinations.

## Adapter boundary

`ContentPartsRenderer` and vendor branches remain behind `toWorkEntries(messageTurn, runtimeFacts)`. The adapter may use raw tool names, `meta`, parser quirks and harness enums; the visual tree may only consume the union. This permits incremental migration and preserves current tests/virtualization.

## Non-goals

No new Session/Execution store, no assistant-ui runtime, no continuation inference, no backend protocol changes, no vendor component imports into generic rows, and no CSS-only lifecycle implementation.
