# Work Order 37 completion audit

Date: 2026-09-13. This audit re-read `AGENTS.md`, the master plan, status,
manifest, blueprint including §10, and the executable work order. It treats the
current worktree, stopped Windows acceptance data root, current test results,
and Git state as authoritative.

## Requirement-by-requirement result

| Requirement | Authoritative evidence | Audit result |
| --- | --- | --- |
| Correct worktree and baseline | Branch `feature/server-http-codex-r1`; `80d2017e9a708421556914cd99d843573daf4c68` is an ancestor of the committed stage chain; manifest write scope matches changed paths | Proven |
| A: independent Windows Server and local authority | Windows CPython 3.12 suite; authenticated `/api/v1`, protected OpenAPI, loopback Host/Origin policy, local SQLite/object store/SecretStore; persistence, future-schema refusal, single owner, shared Core DB and publish-failure tests | Proven |
| HTTP product contract | Strict DTOs and typed errors; durable route-scoped idempotency; Workspace/Profile/Session/Turn/cancel routes; authenticated readiness/discovery; persistent SSE sequence; unknown Session and cursor-ahead refusal; real TCP disconnect/reconnect test | Proven for the work-order subset |
| B: real WSL Worker and bwrap | Independent Rust crate and provenance; wire v1 schema/goldens; digest/identity handshake; real Worker tests for browse, canonical view, one-shot secret, spawn/observe/cancel, result fetch/ack, ownership, lease, TTL and cleanup; explicit Windows/WSL offline gate | Proven |
| Provider-neutral ownership | Work Core has no Codex/DeepSeek branch; application service uses ports; root composition owns plugin selection; Harness owns model validation, native argv/decoder/resume/state classification; Worker owns bounded projection/execution | Proven by dependency inspection and tests |
| C: two real model Turns | User authorized the exact DeepSeek credential source and relaxed retry limit; real Windows Server route completed two `deepseek-flash` Responses requests; Turn 2 omitted the nonce, invoked native `codex exec resume`, recalled it, and retained native thread `01a09ace-1b2d-7953-86a7-7546cee138d2` | Proven |
| C: stream and failure behavior | Persistent events `1..12`; real TCP SSE test proves subscriber close does not cancel; reconnect from cursor has no gap; typed credential/model/config/capture errors are tested | Proven |
| D: stop, cleanup and cold resume | Server stopped normally, its owned remote projection was removed, same Windows data root restarted, and Turn 3 recalled the nonce without receiving it; native identity remained unchanged | Proven |
| D: recovery/state isolation | Restart seals unfinished Turn as unknown without redispatch; shutdown cancels active Worker; same-Profile concurrency rejects; capture/generation conflicts require recovery; config revision stays `1` while native generation advances; another Session receives no transcript/checkpoint | Proven |
| Current persistent result | Windows SQLite read after all implementation work: Session ready, profile idle, recovery false, revision `1`, generation `3`, three completed/captured/cleaned Turns, checkpoint present, exactly 18 events with contiguous range `1..18` | Proven |
| Secret handling | One-shot ACL-restricted source, current-user DPAPI import, plaintext source removed; exact-format repository scan clean; 26 non-DPAPI acceptance files scanned with zero API-key-shaped values; secret config only in execution-scoped Worker mount | Proven |
| Manual acceptance deliverable | `acceptance.md` contains A/B/C/D URLs, Windows start/stop, protected token use, credential import, HTTP/SSE clients, exact versions/digests, expected receipts, cleanup and retained non-secret paths | Proven |
| Scope and cleanup | No Desktop/sibling write, merge, push, reset, stash or shared-root cleanup; Server port 18737 stopped; owned rehearsal workspace and Worker projections absent; persistent encrypted acceptance root intentionally retained | Proven |
| Stage Git checkpoints | Explicit pathspec commits exist for A (`5a45303`), B (`5b71393`), C (`cd5efbe`), and D (the final evidence/status commit). A deterministic [source manifest](checkpoint-manifest.sha256) provides an additional byte-level inventory. | Proven |

## Current verification

- Root test collection: `179 passed, 1 skipped`.
- Codex Harness, WSL Runtime and bwrap collections: `52 passed, 3 skipped`.
- Native Windows Server collection: `22 passed, 2 skipped`.
- Explicit Windows → real `wsl.exe` → Worker → real bwrap → offline Codex
  cold-resume gate: `1 passed`.
- Independent Worker: `3 passed` Rust tests.
- Three confirmed successful DeepSeek requests and one failed pre-connection
  diagnostic attempt. The real-request evidence is unchanged by this audit.
- `git diff --check`, Python compilation, Bash syntax, PowerShell AST parsing,
  repository secret scan and retained-data scan passed.

## Completion decision

The requested runtime, acceptance, evidence, and checkpoint outcome is complete
and currently reproducible. All explicit Work Order 37 requirements are proven;
the terminal state is `SERVER_HTTP_CODEX_R1_GREEN`. No new executable work order
is queued.
