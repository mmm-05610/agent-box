# FE-AGENT-001 capability matrix

Evidence through 2026-09-22, HEAD `ea15d53427`: D = installed docs/schema/types; S = fake-bridge unit; P = real isolated process without model; M = real model (none yet). Process facts were observed with temporary `PI_CODING_AGENT_DIR`/`CODEX_HOME` and a temp workspace.

| User ability / state | Codex 0.155.1 | Pi 0.86.1 | Common UI rule |
|---|---|---|---|
| Connect/reconnect | `app-server` stdio, initialize/initialized (P handshake) | typed RpcClient start (P) with per-session processes | Explicit instance and status. Reconnect is manual; no resend of prompt. Codex requires `CODEX_HOME` to exist when overridden (P). |
| History | `thread/list`, `thread/read`, `thread/resume` (list P, resume S) | SessionManager `list` (P) + `open` via `--session` (P) | Server/official manager authoritative. Pi empty new sessions are absent until the first assistant message flushes the file (P); shown honestly, not fabricated. |
| New/open | `thread/start` (P local), `thread/resume` | `new` spawns a process (P); `open` reuses it (P) | Switch is not abort. Pi switch across processes never touches the running one. |
| Send/stream | `turn/start`, item and turn notifications (S) | `prompt` ack then `message_update` deltas, `message_end` authoritative (S) | Accepted request is not completed execution. Second prompt on a running Pi session is rejected, not queued. |
| Reasoning | `item/reasoning/summaryTextDelta`, `textDelta` (S) | `thinking_delta` (S) | Show only content actually supplied. |
| Tools/results | item started/completed plus output deltas (S) | `tool_execution_*` with accumulated partialResult then final result; one merged card per toolCallId across `toolcall_*`, `tool_execution_*` and toolResult sources, terminal state sticky (S) | Correlate by tool ID; text/JSON fallback. |
| Stop | `turn/interrupt` then `turn/completed` (S) | `abort` waits for idle (D), idle abort round-trip (P); verdict: mapped final `stopReason` only — `aborted` is the sole verified cancellation; unmapped reason, missing final message, or an unconfirmed stop request all stay unknown with diagnostics, and run facts never carry across runs/processes (S) | Requested, confirmed and unknown are separate states. `agent_settled` and stop requests alone never mean cancelled or completed. |
| Interaction | generated approval and user-input requests (S) | extension UI `select`/`confirm`/`input`/`editor` dialogs (S; native guard probed with a nonexistent id, P) | Shared interaction kinds with exact options; Pi dialog is not an approval. Fire-and-forget `notify` shows as diagnostics. Unknown requests stay diagnostic. |
| Model/mode | `model/list` and per-turn model/effort (S) | `get_available_models`/`set_model`, thinking levels (S; empty list in unconfigured agent dir, P) | Offer only declared/available options. No provider/credential management. |
| Running switch | thread/turn IDs in notifications (S) | one active session per process; concurrent idle processes open/reopen independently (P) — running-session non-interference unverified | Selection alone does not cancel. Late/foreign-instance events dropped. |
| Disconnect | stdio process exit (S; exit event on close P) | RPC process exit → `transport_exit` (S) | Mark outcome unknown; other Pi sessions unaffected; do not claim success/failure. |

Remaining unverified (M): real model turns, live streaming/reasoning/tool events, mid-run stop confirmation, real extension dialogs and Codex approvals, non-interference of two concurrently *running* Pi sessions, a complete one-shot answer to a real dialog, Codex parallel threads on a real process.
