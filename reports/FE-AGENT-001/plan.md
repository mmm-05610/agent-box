# FE-AGENT-001 implementation plan

2026-09-22, baseline `3f8b0647e4c4c665cdd9bcdf7105901398d62739`, clean tree.

## Boundaries

Keep host API v2 and `app.tsx` domain-neutral. Product defaults only in `extensions/product.json`; user `extensions.json` remains a complete override, including `[]`. Add distinct browser extension entries for shared contracts, connection registry, sessions, conversation and interactions, plus Codex and Pi adapters. Use Lumino dependencies and `ResourceScope`; no new scheduler. The two adapters contribute records to one scoped connection registry, never both provide one Lumino token. Optional `agent-client-state` is omitted if `Contributions`/`useSyncExternalStore` suffice.

Native Node transport requires a separate entry. Extend manifest with an optional, constrained native entry only for installed, explicitly enabled, bundled agent adapters; validate via the existing confined file logic. Main registers one narrow allowlisted transport interface (open, write framed JSON, close, event subscription), dispatches by adapter ID, and owns only child processes it starts. Keep protocol mapping, CLI arguments and connection policy in adapter native entries. Avoid arbitrary executable/path/args from renderer; validate sender, message size and stream framing. Preload exposes fixed methods, never `ipcRenderer`. Cleanup on extension release/window close; events carry instance and generation. Keep Electron `sandbox: true` and `contextIsolation: true`.

Shared contract carries minimal capabilities, connection/session/message/turn/tool/interaction snapshot and operations/subscription. Distinguish unsupported, unknown and temporarily unavailable. Expose neither assistant-ui types nor raw protocol registry. Adapter side turns native events into shared snapshots. Session list is service authoritative: Codex `thread/list`, Pi's installed SessionManager list; no local ad hoc scanner. A view switch changes selection without aborting runs. Stop remains requested until the server confirms a terminal state. Disconnect yields unknown outcome. Reconnect rehydrates server state and ignores events from older connection generations. Every interaction response is one-shot and bound to instance and request ID.

## Stages

- M0: version/source inspection; reuse map; capabilities; native bridge design. Record source, license, fixed version and open gaps before code.
- M1: contracts, connection/session services, native bridge, Codex adapter, shared conversation/interactions; offline protocol fixtures and Electron test. Use generated Codex 0.155.1 types.
- M2: installed Pi 0.86.1 adapter, its RPC client/SessionManager patterns and extension UI dialog semantics. Run identical contract matrix and remove any Codex-biased shared fields.
- M3: isolated Electron verification and startup documentation, including separate opt-in product preview config; complete verification matrix with documentation/simulation/real-process/real-model provenance. Real model use awaits a concrete authorization scope or user-driven acceptance.

Serial testing and explicit-path local commits after each stage. No push, backend changes, existing service stop, credential reading, profile/provider configuration or real project agent call.
