# FE-AGENT-001 verification

2026-09-22, HEAD `85cc3cd014` (dual-adapter implementation checkpoint; **not** usage acceptance). Evidence levels: **D** = versioned documentation/schema/source inspection; **S** = fake bridge or unit simulation; **E** = isolated Electron shell without an agent process; **P** = real local agent process without model; **M** = real model conversation. **No M evidence exists.** Scripts: `npm test` (S), `node apps/desktop/scripts/test-agent-process.mjs` (P, temp `PI_CODING_AGENT_DIR`/`CODEX_HOME`/workspace, no user state, no model calls), `xvfb-run -a npm run test:agent-shell` (E).

## Acceptance matrix

| Required case | Codex | Pi | Evidence and remaining check |
|---|---|---|---|
| Two conversational turns | S | S | Request/ack/turn flow unit-tested on both adapters (`agent-codex.test.ts`, `agent-pi.test.ts`); `prompt` ack≠completion asserted for Pi. Real two-turn model loop untested (M). |
| Streaming, reasoning, tools/results | D/S | D/S | Codex item deltas; Pi `message_update` text/thinking/toolcall deltas, authoritative `message_end`, and one merged tool card per toolCallId across `toolcall_*` + `tool_execution_*` + toolResult sources with sticky terminal state (S, full-sequence test including a late-update regression attempt). Real-model event variants untested (M). |
| Terminal state | D/S/P-part | D/S | Codex `turn/completed` projection S; real process handshake P. Pi `agent_settled` only proves the run ended: a mapped final `stopReason` (`stop`/`error`/`aborted`) is the only definite verdict, and explicit `aborted` is the only verified cancellation; an unmapped reason (diagnosed), a missing/stopReason-less final message, or a requested stop without confirmation all stay unknown with diagnostics — stop requests never infer a verdict. Counter-cases: normal-completion race, unmapped reason, stop-requested＋no `message_end`＋`agent_settled`→unknown, and cross-run/process state cleanup (S). No real run observed (M). |
| Stop requested vs confirmed | D/S | D/S | Both adapters keep `stop-requested` until the server's terminal event; late events cannot resurrect a terminal run (S). Pi idle `abort` round-trip on a real process P; mid-run stop untested (M). |
| Switch while running | S | S/P-part | Selection never issues stop (session service S). Pi: two concurrent session processes opened and reopened independently on a real process — **idle only**; non-interference of two *running* sessions not verified (M). Codex: parallel threads on a real process untested. |
| History recovery | D/S/P-part | D/S/P | Codex `thread/list`+`thread/start` on isolated real process P; `thread/resume` projection S. Pi: persisted session listed via official `SessionManager`, reopened through `--session` with messages verified (P); history tool facts merge to single cards (S). Pi empty sessions stay out of history until the first assistant message (P, Pi semantics). |
| Disconnect and late event | D/S/P-part | D/S | Codex real process exit event on close P; mid-run disconnect outcome unknown S. Pi `transport_exit` marks run/interactions unknown, other sessions unaffected (S). |
| Duplicate/expired interaction | D/S | D/S/P-part | One-shot binding to instance+session+request, duplicate and invalid answers rejected, expiry transitions, agent-settled expiry (S both). Pi native `respond` for a **nonexistent** request id rejected on a real process (P); a complete one-shot answer to a real dialog unverified (M). |
| Unload cleanup | S/E | S/E/P-part | Adapter dispose closes the bridge instance (S); shell mounts/unmounts the view path (E). Codex child exit observed on transport close (P). Pi child stop goes through the vendored `RpcClient.stop`; closed transport rejects further operations (P-indirect, no direct child-exit observation). |
| Empty host and opt-in shell | E | E | `test:electron` empty host passes after both adapters; `test:agent-shell` shows Codex and Pi together in one sandboxed shell, no renderer errors, no Node exposure. |
| No-backend host | E | E | No Ordessa backend dependency; adapters talk only to local CLI processes. |

## Last command results

| Command | Result | Scope |
|---|---|---|
| `npm run typecheck` | **pass, exit 0** | Both adapters and tests. |
| `npm test` | **pass, 60 tests in 8 files** | Serial; includes 10 Pi adapter tests on the shared contract matrix (stop race, unmapped reason, no final message, cross-run cleanup, full toolCallId sequence). |
| `npm run build` / `build:foundations` | **pass** | Pi browser entry and `native.js` artifact built, manifest `native` field set. |
| `node apps/desktop/scripts/test-agent-process.mjs` | **pass** | Isolated real processes: Pi parallelSessions/history/options/oneShotGuard/cleanup, Codex handshake/history/localThreadStart/exitEvent. |
| `xvfb-run -a npm run test:agent-shell` | **pass** | Dual-adapter opt-in shell: `codexVisible` and `piVisible` true, no renderer errors. |
| `xvfb-run -a npm run test:electron` | **pass** | Empty host still mounts with both adapters available but not enabled. |
| `xvfb-run -a npm run test:extensions` / `test:foundations` / `test:agent-ui` | **pass** | Pre-existing suites unaffected by the Pi wiring. |
| `git diff --cached --check` | **pass** | Before each stage commit. |

## Verification boundaries

- This is a **dual-adapter implementation checkpoint**, not usage acceptance: no real model conversation has been run through either adapter. Real-usage acceptance (two live turns per agent) is the user's next step and requires their explicit action or authorization.
- No real model call, credential read, provider profile change, backend request, or user session/history access happened. Process tests used temporary `PI_CODING_AGENT_DIR`, `CODEX_HOME` and workspace directories and cleaned up only those.
- The Pi event stream produced no frames during process tests (`piEvents: 0`): without model activity Pi emits no events, so live streaming/stop/extension-UI behavior remains S until M-level evidence. Likewise, "two parallel sessions" at P level means two idle RPC processes with independent open/reopen; running-session non-interference is not yet proven, and the one-shot interaction guard was only probed with a nonexistent request id.
- Discovered environment constraints, verified on real processes: Codex exits when `CODEX_HOME` points to a missing directory; Pi sessions flush to disk only after the first assistant message; Pi `get_available_models` is empty in an unconfigured agent dir.
- Fake-bridge tests check adapter projection, not CLI compatibility; the process script checks the native artifacts actually shipped in `extensions/dist`.
- Reports intentionally stay uncommitted in the `control` repository (which is its own independent git repo, parent of this reports directory); the worktree commits are listed in `status.md`.
