# Source adoption plan

## Rule

The local component system and Agent-Box adapter are primary. “Upstream → local” below means a deliberate port or reimplementation; it is not permission to install dependencies or copy without the ledger record.

| Upstream | Local target | Action |
|---|---|---|
| AI Elements `packages/elements/src/message.tsx` | existing `src/components/ai-elements/message.tsx`, future `AssistantProse/UserEntry` | retain local markdown/action behavior; reimplement flat wrapper; no default bubble/card assumptions |
| AI Elements `packages/elements/src/reasoning.tsx` | `ReasoningDetails` under future transcript | port context/compound disclosure and streaming auto-close; local `AdaptedContentPart`, tokens and tests |
| AI Elements `packages/elements/src/tool.tsx` | `WorkEventRow` details | port typed header/content split only; reject border/badge/pill skin and vendor AI SDK state |
| AI Elements `packages/elements/src/prompt-input.tsx` | `Composer` subcomponents | port attachment validation/context ideas; retain existing `MessageInput` draft/queue/steer/fork authority |
| AI Elements `attachments.tsx`, `sources.tsx`, `confirmation.tsx`, `code-block.tsx` | attachment/source/decision/code detail slots | structure-only; use local UI primitives and i18n |
| assistant-ui `packages/react/src/primitives/thread/` | `WorkTranscript` | reimplement compound/headless pattern; do not copy runtime or provider |
| assistant-ui `packages/react/src/primitives/composer/` | `Composer` | reimplement keyboard/composition pattern around current callbacks; verify attachment source names locally |
| Cline `ChatRow` lineage and tool renderers | `WorkEventRow`/adapter | reimplement row dispatcher and explicit approval/error action; exclude proto, VS Code bridge and extension state |
| OpenCode `packages/app` part UI (SHA pending) | adapter-driven event details | reimplement DOM/state relationship after pinning source; do not import runtime |
| Open WebUI `src/lib/components` attachments/sources/search | existing composer/source affordances | visual reference only; no code or branding |

## LOCAL_IMPLEMENTATION list

`FlatWorkEntry`, `WorkTranscript`, `TranscriptEntry`, `WorkEventHeader`, `WorkEventStatus`, `DecisionBlock`, `PermissionBlock`, `FailureBlock`, `ContinuationNotice`, `ExecutionLineagePanel`, `DelegationPanel`, and `ComposerContextSummary` have no safe one-to-one upstream source. Implement locally with discriminated unions and Agent-Box authority boundaries.

## Pre-copy checklist

Before any future copied code lands: pin SHA; verify source path and license; compare local dependency/API assumptions; add attribution/NOTICE if required; annotate modification extent; add focused tests; confirm no brand or protocol coupling; run `git diff --check` and license scan.
