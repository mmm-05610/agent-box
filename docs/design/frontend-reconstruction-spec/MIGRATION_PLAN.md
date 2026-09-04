# Migration plan

All phases are independently reviewable and reversible. No phase changes backend/API/Session/Execution semantics. Each starts only after a human checkpoint.

| Phase | User-visible result | Modify | Do not modify | Backend | Tests/fixtures | Risk / rollback / checkpoint |
|---|---|---|---|---|---|---|
| UI-2A View model + skeleton | flat entries render from existing turns; no visual promise beyond structure | new adapter/view-model modules, `WorkTranscript`, focused tests | runtime authority, renderer behavior, virtualizer | no | union/type tests, existing transcript fixtures | medium; feature flag or revert new adapter; review emitted entries |
| UI-2B prose/user/reasoning | assistant prose direct on canvas; user lightly distinct; reasoning collapses after completion | `message-list-view`, `ai-elements/message/reasoning`, local transcript components | scroll anchoring, Markdown pipeline, source data | no | empty/long/streaming/completed screenshots; reasoning a11y | medium; per-entry renderer fallback; human density review |
| UI-2C tools/command/file | all ordinary tools share one event row; details only on expand | `agent-capsule`, `agent-tool-call`, `tool-call-block`, `ai-elements/tool`, specialized dispatch styling | vendor parsers, tool lifecycle, registered behavior | no | running/completed/error/search/read/edit/command fixture matrix | high; retain old renderer behind adapter flag; compare virtualized heights |
| UI-2D decisions/failures | permission/question/error use temporary elevated blocks and degrade after resolution | permission/question/failure banners/cards, `conversation-shell` placement | authority, response callbacks, dialog semantics | no unless DTO lacks typed facts; default no | approve/deny/retry/fatal/timeout keyboard and SR fixtures | high; revert placement only; checkpoint with product/accessibility review |
| UI-2E Composer IA | one primary send/stop, summary + popovers, queue remains functional | `message-input`, `chat-input`, composer selectors/queue | draft serialization, offline, steer/fork, attachment behavior | no | send/stop/queue/attachment/slash/mention/binding screenshots | medium/high; old layout toggle; test all callback paths |
| UI-2F responsive/theme/a11y | 1440/1024/390, light/dark, 150%, reduced motion closeout | semantic tokens/classes and component tests | FOUC, WebKit rem, panel animation, ws surfaces | no | full acceptance matrix and Playwright fixture | medium; token changes revert independently |
| UI-3 Execution/Delegation/Terminal | on-demand panels and read-only parent selection | new panels, aux registry wiring, dock integration | backend contracts until stable; no new authority | only after DTO/preflight approval | tree/delegation model isolation, drawer screenshots | very high; do not ship without API checkpoint |

## Behavior invariants across all phases

Virtualization, prepend/scroll anchor, keep-alive/inert, queue order and fallback, attachment lifecycle, keyboard paths, WebSocket status, theme initialization, and static export remain green. Completed events degrade; no user action is lost; errors remain actionable.

## Screenshot and rollback protocol

Each phase captures empty/default, long response, consecutive tools, running/completed/error, permission, expanded command, file change, 390px, 150%, light/dark, keyboard focus and reduced motion as applicable. Roll back when a fixture changes scroll anchor, loses focus/keyboard path, creates overflow, changes callback payloads, exposes credentials, introduces card stacking, or requires a second authority. Use a phase-scoped revert; never reset or stash unrelated work.
