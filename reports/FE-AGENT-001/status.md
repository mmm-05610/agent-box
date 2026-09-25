# FE-AGENT-001 status

2026-09-22. **Dual-adapter implementation checkpoint, not usage acceptance** — the user will run the real two-turn conversations themselves. Worktree `/home/maoqh/projects/ordessa/worktrees/desktop-minimal`, branch `work/desktop-minimal-0`, HEAD `85cc3cd014`. Local commits this task: `9065949e5c` (contracts, scoped registry, native bridge), `475e7cc166` (Codex adapter and shared shell, predecessor), `c31ed05ba4` (Pi adapter with per-session RPC transport), `ea15d53427` (isolated real-process verification), `1441b39cb4` (startup and onboarding documentation), `c85e3b0b06` (review fixes: stop verdict and tool-card merge), `5ef1d5f9ac` (unknown-outcome tightening: unmapped stopReason and missing final message stay unknown; cross-run state cleanup), `85cc3cd014` (stop-request inference removed entirely). No push, no merge, no reset/stash/clean; the three uncommitted handoff items were preserved and landed in `c31ed05ba4`. Reports are intentionally uncommitted in the `control` repository (an independent git repo). **Writing stopped at handoff after `85cc3cd014`; no further repository writes in this session.**

## Review fixes after user inspection (c85e3b0b06)

- Stop verdict: `agent_settled` no longer turns a prior stop request into `cancelled` on its own. An explicit final `stopReason` (`stop`/`error`/`aborted`) is authoritative; only a requested stop that settles **without** any final assistant message infers `cancelled`. Counter-case tests cover the normal-completion-vs-stop-request race, abort-without-request, and error.
- Tool projection: all three tool fact sources (assistant `toolCall` blocks, `toolcall_start/end`, `tool_execution_*`, and `toolResult` messages) merge into exactly one card per toolCallId, in live events and in history reload; terminal card states are sticky against late running updates; the assistant text message stays separate. Verified with a full-sequence test, not per-fragment tests.
- Evidence wording tightened: two idle RPC processes ≠ proof that two *running* sessions don't interfere; rejecting a nonexistent interaction id ≠ a complete one-shot response to a real dialog (both now marked as such); `control` confirmed as its own git repository.

## Follow-up tightening (5ef1d5f9ac)

- `agent_settled` fallback removed: the verdict now distinguishes mapped final `stopReason` (completed/cancelled/failed), unmapped reason (stays `unknown`, surfaced as a diagnostic — no guessed terminal), and no final assistant message (`unknown`; `cancelled` only when a stop was requested). The previous code both failed to actually verify "no final message" and defaulted unknown reasons to `completed`.
- Cross-run state hygiene: per-session verdict facts and streaming slots are cleared on new run (`send`), on `transport_exit`, on `agent_settled`, and on reopening a session with no live run; a live run keeps its bookkeeping across reopen because the native side reuses its process. Counter-tests: stale `error` reason from a dead run cannot verdict the reopened session's next run; a stray streaming delta after a settled run cannot append to the previous run's message.
- README Pi stop semantics and the capability matrix / verification matrix updated to match.

## Stop-exception removal (85cc3cd014)

- The "stop requested and no final message → cancelled" inference is deleted. An unconfirmed stop request now stays `unknown` with the diagnostic "Stop was requested; the run ended, but its outcome was never confirmed". Only an explicit `aborted` final stopReason (or another server-verified cancellation) verdicts `cancelled`; stop requests alone never verdict anything.
- Counter-case updated: stop-requested＋no `message_end`＋`agent_settled` → `unknown` (was `cancelled`); server-said `aborted` → `cancelled`; `error` → `failed`. Verified with typecheck and the Pi adapter suite only (10/10); unrelated suites not rerun.
- README, capability matrix and verification matrix wording synced.

## Implemented

- Pi 0.86.1 adapter complete and enabled in the opt-in preview: renderer projection (`extensions/agent-pi/src/client.ts`), native per-session-process transport (`native.ts`) using the vendored versioned RPC client plus the installed package's `SessionManager`, plugin `entry.ts` registering into the same scoped connection service as Codex. Built into `extensions/build.mjs` (Pi package stays external in the native bundle) and listed in `extensions/agent-preview.json`.
- Contract matrix tests for Pi (`apps/desktop/src/agent-pi.test.ts`): server history and options, parallel sessions without cross-cancellation, stop-requested vs terminal confirmation with late-event rejection, streaming text/reasoning/tools with authoritative `message_end`, disconnect outcome unknown with session isolation, one-shot/expired/duplicate interaction answers bound to instance, session and request, unknown-event diagnostics, dispose closing the bridge.
- Real-process verification script `apps/desktop/scripts/test-agent-process.mjs` (`npm run test:agent-process`): isolated temp config/workspace, no model calls, drives the shipped native artifacts. Pi: two concurrent RPC processes, seeded persisted history via official `SessionManager` and resume through `--session`, reopen reuse, typed option responses, idle abort, native one-shot guard, transport close. Codex: `initialize`/`initialized` handshake, isolated `thread/list`, local `thread/start`, exit event on close.
- Electron smoke now asserts both connections in one shell (`piVisible`), plus the unchanged empty-host smoke. README carries user startup steps and both onboarding procedures.

## Verified

`npm run typecheck` pass; `npm test` pass **60 tests / 8 files** (10 Pi adapter tests); `npm run build` and `build:foundations` pass; process script pass (Pi and Codex, isolated); `xvfb-run -a npm run test:agent-shell` pass (Codex+Pi visible, no renderer errors); `xvfb-run -a npm run test:electron` empty host pass; `test:extensions`, `test:foundations`, `test:agent-ui` pass unchanged. Vendor review: `extensions/agent-pi/src/vendor` matches installed 0.86.1 with exactly the three documented adaptations (stderr drain, `transport_exit` notification, `sendExtensionUIResponse`); `jsonl.js` identical. Full provenance in `verification.md`.

## Real findings this session (process-verified)

- Pi flushes a session file only after the first assistant message; empty new sessions are absent from `SessionManager.list` (asserted, not worked around).
- Codex exits when `CODEX_HOME` names a missing directory; the test creates it first.
- Pi `get_available_models` returns an empty list in an unconfigured agent dir; UI offers only declared values.
- The Pi RPC event stream is silent without model activity, so live event handling stays at S evidence.

## Outstanding

- **User-run usage acceptance**: connect one agent each (Codex, Pi) and hold a real two-turn conversation, per the README onboarding steps. This is the deliberate next step, not background work.
- M-level open items: live streaming/reasoning/tool events, mid-run stop confirmation, real extension-UI dialogs and Codex approvals, non-interference of two concurrently running Pi sessions, a complete one-shot answer to a real dialog.
- Codex parallel threads on a real process and Pi child-exit observation on unload are P-part/P-indirect; optional follow-ups.
- No other blockers. Nothing uncommitted remains in the worktree.
