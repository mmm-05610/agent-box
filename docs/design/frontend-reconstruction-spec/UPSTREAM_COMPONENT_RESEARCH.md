# Upstream component research

研究日期：2026-09-05。源码证据优先于 demo 外观；路径和 SHA 记录见许可证台账。以下“吸收”均指结构/方法移植，不代表直接复制默认视觉。

## Vercel AI Elements

- Repository: `vercel/ai-elements`; commit `6a9d5b1822ffb10bba4bd97175f01edd7d8651cd`。
- Stack: React + TypeScript + shadcn/ui registry + Tailwind CSS variables；源码集中在 `packages/elements/src/`，registry 示例在 `skills/ai-elements/scripts/`。
- Relevant files: `conversation.tsx`, `message.tsx`, `reasoning.tsx`, `tool.tsx`, `prompt-input.tsx`, `attachments.tsx`, `confirmation.tsx`, `artifact.tsx`, `code-block.tsx`, `sources.tsx`。
- Useful: compound components with context; `MessageAction` supplies visually hidden accessible label; `Reasoning` models streaming/open/auto-close; `PromptInput` separates text and attachment contexts and reports file validation errors; `ToolHeader` has typed state mapping; conversation scroll button and code-block copy are reusable interaction patterns.
- Not reusable as-is: `Tool` is a rounded bordered card with colored status badges; Message assumes AI SDK `UIMessage`; PromptInput contains provider/attachment state; Conversation assumes AI SDK streaming and no Agent-Box execution authority; registry installation would add dependencies and overwrite local conventions.
- Studio action: port the compound shape and state/accessibility ideas into local components; do not install the registry or let AI SDK types become the canonical domain model.

## assistant-ui

- Repository: `assistant-ui/assistant-ui`; official repository and package metadata report MIT; the shallow clone metadata was incomplete, so exact source SHA is recorded as unresolved in the ledger and no code is copied.
- Stack: TypeScript/React packages, headless runtime primitives, optional AI SDK/LangGraph adapters, generated shadcn components.
- Relevant official paths: `packages/core/src/runtime/api/message-runtime.ts`, `packages/react/src/primitives/thread/`, `packages/react/src/primitives/composer/`, `packages/react/src/primitives/message/`, `packages/react/src/primitives/attachment/`, `packages/react-ui/`; examples at `apps/docs/components/examples/base.tsx`.
- Useful: `ThreadPrimitive`, `MessagePrimitive`, `ComposerPrimitive`, `BranchPickerPrimitive`, `ErrorPrimitive`, attachment adapters, scoped subscriptions, keyboard-oriented compound composition, retry/edit/branch affordances, and auto-scroll lifecycle.
- Conflict: `AssistantRuntimeProvider` and `useAui` create a second thread/message/composer runtime. Agent-Box already has transport, `conversation-runtime-context`, reducer/store, queue, SessionEvent normalization and Work Core authority. Do not introduce provider/runtime ownership.
- Known evidence caveat: official issue #3477 shows a generated attachment template mismatch (`composer` versus `thread-composer`/`edit-composer`); all ported behavior must have local tests rather than blind template copying.
- Studio action: use primitive composition patterns only; local adapters remain authoritative.

## Cline

- Repository: `cline/cline`; current official license is Apache-2.0. The current tree moved across webview/CLI packages, so paths must be verified against the implementation commit before any future copy.
- Relevant official concepts/paths: `webview-ui/src/components/chat/ChatRow.tsx` in the historical React webview lineage; current repository guidance points to `ChatRow.tsx`, `cline-message.ts`, `src/shared/ExtensionMessage.ts`, tool handlers and proto enums. Official instructions explicitly require a new UI tool to flow through enum → shared message type → `ChatRow` renderer.
- Useful: a centralized row dispatcher, explicit say/tool event types, separate command/file/browser result renderers, approval/denial as an event-specific action, and terminal output treated as bounded long content.
- Not reusable: VS Code webview bridge, protobuf enums, extension state, model-specific tool names and host lifecycle. Copying a row would import a second vendor event taxonomy.
- Studio action: port the event-row interaction and explicit approval/error affordances into the local `FlatWorkEntry`; retain local adapter normalization.

## OpenCode

- Repository: `anomalyco/opencode`; official LICENSE is MIT. Research branch is `dev`; exact source SHA was not available from the interrupted clone and is unresolved in the ledger.
- Relevant official areas: `packages/app/` UI components and `packages/web/` SDK/documentation; official SDK describes `Part[]`, session command, file read and patch outputs. Exact component file names are intentionally not treated as copy candidates until the target SHA is pinned.
- Useful: compact part-oriented transcript, one tool/command/file vocabulary, task/sub-session as a distinct part, narrow metadata, responsive desktop/web shell, and completed/running/error differentiation without requiring every part to be a large card.
- Not reusable: OpenCode’s own session/runtime protocol, Solid/non-React application assumptions where present, and vendor-specific part enums. Port DOM/state relationships only.
- Studio action: reimplement the compact part row locally and map it from `AdaptedContentPart`.

## Open WebUI

- Repository: `open-webui/open-webui`; current post-v0.6.6 code is under a custom Open WebUI License with branding restrictions and historical code has MIT/BSD-3-Clause boundaries. This makes current UI copying inappropriate.
- Relevant official areas: `src/lib/components/` for attachments, citations, knowledge/workspace, model settings, resource management and conversation search/folders; `src/app.html` documents protected branding surfaces.
- Useful only as product-information research: attachments/resources grouping, sources/citations affordances, mobile navigation, search/folder organization and settings disclosure.
- Not reusable: current source code, branding surfaces, general-purpose model-chat information architecture, or any assumption that Studio should become a model marketplace.
- Studio action: visual/product reference only; reimplement only the narrow interaction pattern needed by existing Studio features.

## Cross-project synthesis

The common portable pattern is: typed event/part adapter → compound visual primitives → one clear action surface → bounded expandable details. The common non-portable pattern is runtime-owned state, vendor protocol enums, default card skins and host bridges. Studio should adopt the former at the adapter boundary and reject the latter.
