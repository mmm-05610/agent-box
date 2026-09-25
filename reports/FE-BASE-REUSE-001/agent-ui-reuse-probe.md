# Agent conversation UI reuse probe

2026-09-22. User-approved bounded reuse experiment on `worktrees/desktop-minimal`, baseline `be8e2ebdc7`. Not a real-agent integration or a product-readiness verdict.

## Decision supported by evidence

Use `@assistant-ui/react` **0.15.21** privately inside a future conversation extension. Its ExternalStoreRuntime can render externally owned snapshots and invoke external send/cancel handlers. It does not require changing Ordessa's backend protocol or adding agent semantics to the host/workbench.

Official references read:
- https://www.assistant-ui.com/docs/runtimes/custom/external-store
- https://www.assistant-ui.com/docs/api-reference/primitives/message
- https://www.assistant-ui.com/docs/api-reference/primitives/composer

Local installed package types/source were also inspected. React 19.2.7 compatibility was exercised, not inferred only from peer dependency declarations.

## What exists

`examples/agent-ui-probe/` is independently built and explicitly enabled only by the isolated test. Its `store.ts` is a controlled service fixture, `view.tsx` maps service data and composes library primitives, and `entry.tsx` uses the existing scoped command/view APIs. No additions to foundation contracts, workbench, host API, app composition, backend, or user extension configuration.

Shared service contracts should not expose assistant-ui runtime types. A future conversation package owns conversion; session, connection and permission management remain separate. This avoids making a chat library the architectural authority for the whole application. React composition/performance guidance informed the injected fixture, stable callbacks and top-level message renderers.

## First-hand evidence

- Typecheck/build/diff check: pass.
- Unit suite: **45 passed** (42 existing + 3 new). Real library runtime and message/tool primitives mounted in jsdom; not mocked implementations.
- Isolated Electron probe: **9 checks passed** — history, composer callback, two streaming updates, tool call/result, cancel callback, stale generation rejection, session restore, failure and completion.
- Electron renderer remained sandboxed, Node globals absent; temporary test launcher alone uses `--no-sandbox` as in existing smoke tests.
- Screenshot inspected: `/tmp/ordessa-agent-ui-probe.png` (temporary evidence, not a installed user feature).
- Initial streaming assertion failed because the library defaults to smooth typewriter timing. Probe explicitly uses the public Text primitive with `smooth={false}` to display received snapshots immediately. This is not a replacement implementation of streaming.

Cancel acknowledgment and stale-event filtering belong to the fixture. The real service adapter must handle unconfirmed cancellation and concurrent/background sessions; these tests do not prove that production behavior.

## Cost and constraints

- Fixed MIT package; license copied alongside built probe.
- npm installed 92 packages; unminified probe entry is **641,006 bytes**, with React external/shared. This is an experiment build measurement, not production gzip size or performance benchmarking.
- Library has transitive assistant-cloud dependencies but the probe configures no cloud adapter, provider credentials or real network transport.
- npm audit still lists the four existing Electron/extract-zip/Vitest/mocker findings (2 high, 2 moderate). No newly named package in that report. No force upgrades; not a security clearance.
- No Markdown/reasoning/attachments/approval rendering, real reconnect, long-history performance, formal accessibility audit, persistent session storage or model configuration claims.

Next implementation can introduce the service-level extension packages around this evidence. Do not elevate the fixture shape into a frozen protocol, install the demo as production UI, or claim a real harness loop is complete.
