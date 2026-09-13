# Stage C/D — real DeepSeek Codex and cold resume

Date: 2026-09-13. Work order: 37. Final state:
`SERVER_HTTP_CODEX_R1_GREEN`. See [the completion audit](completion-audit.md).

## Authorized source and secret handling

The user explicitly supplied one DeepSeek API credential in this Codex session,
authorized writing the configuration, and later permitted additional API tries.
The key was passed to a new, ACL-restricted Windows staging file without placing
it in argv or command output. The one-shot management CLI imported that exact,
twice-confirmed source as current-user DPAPI and returned only credential locator
`credential_99d2394e2f2f460aa911bff1ee569b4c`. The plaintext file and its staging
directory were immediately removed and verified absent.

The surviving acceptance root is
`C:\Users\maoqh\AppData\Local\Temp\agent-box-server-real-8c0e676ac15249f7aabc97e59821c1b2`.
It intentionally retains the DPAPI ciphertext, Windows SQLite state, immutable
objects, protected HTTP token, and Stage C receipt for local review and another
cold resume. A byte scan of all 26 non-DPAPI files found zero API-key-shaped
values. The repository scan found no value matching the supplied key's format.

At execution time, the Codex Harness converts the opaque secret bytes into an
isolated `/runtime/home/config.toml`. It selects provider `deepseek`, base URL
`https://api.deepseek.com/`, Responses wire API, and a secret bearer token. The
config is mounted read-only as a Worker secret and never appears in argv,
environment, events, result objects, or docs. A small non-secret `models.json`
catalog bounds the accepted model to `deepseek-flash`.

## Real C and D observations

The production route was Windows native Server → authenticated HTTP/SSE → real
`wsl.exe` Ubuntu connector → release Worker → real bwrap → Codex CLI → DeepSeek
Responses API. Stage C created Session
`session_3cea242079bd40fd8c360402f012e383` and completed two Turns. Turn 1 asked
Codex to remember a random nonce; Turn 2 omitted it and recalled it through the
official native resume command. After a normal Server stop and owned projection
cleanup, Stage D restarted the same Windows data root and completed Turn 3. It
again recalled the nonce without receiving it in the prompt.

All three Turns kept native thread
`01a09ace-1b2d-7953-86a7-7546cee138d2`. The persistent Session is `ready`, has
profile revision `1`, native generation `3`, three completed Turns, no recovery
pending, and durable event sequence `1..18`. The latest checkpoint receipt is:

| Item | Evidence |
| --- | --- |
| Checkpoint object | `sha256:2e9862019f774f9eca0a72ec4f3d7cdbd8ad44e7b31be6ed6b7120972c7392c1`, 341 bytes |
| Native session file | classified `sessions/...01a09ace-1b2d-7953-86a7-7546cee138d2.jsonl`, `sha256:a4965e2a9da5b5a7c342534c5a67fe9c881db3d14b71bc2189a2d08f61ef0204`, 29,798 bytes |
| Turn 1 result | `sha256:22a6681c333107aaafb5a0ffc496fffcfd58643b65a328119095242a45169414`, 388 bytes |
| Turn 2 result | `sha256:55b84022944d1068d70388462be10dd22d532493dcef095c1f9950617b9c7790`, 382 bytes |
| Turn 3 result | `sha256:77a6e17aac1654e8612149affcc4f593a21c586ef3dbf16a6a2410a8d04ba712`, 383 bytes |

Each successful Turn records capture complete and cleanup `cleaned`; its result
was published on Windows before Worker acknowledgement. The Stage C receipt is
`stage-c-receipt.json` under the acceptance root. It holds only acceptance IDs,
the generated nonce, request count, and process evidence—no credential.

## Attempts and repaired failure

There were four Codex execution attempts. Three are confirmed successful
DeepSeek model requests: C Turn 1, C Turn 2, and D Turn 3. One earlier diagnostic
attempt defaulted to the OpenAI provider and hit the WSL resolver symlink problem.
DNS resolution failed before any network connection was established, so the
credential was not transmitted. The Server preserved a typed `TURN_TIMEOUT`, no
checkpoint/result, and recovery-required evidence. The repair made the provider
explicit and added only the exact resolver bind required by WSL; the final Worker
policy rejects broader `/mnt` mounts. Two still earlier script failures occurred
before HTTP/model execution and do not count as model attempts.

The work order's original four-attempt ceiling was therefore not exceeded even
though the user later relaxed it. Input remains bounded to 4 KiB and execution to
120 seconds. Codex exposes no hard output-token flag on this command path, so the
acceptance prompts requested one short value instead of claiming a hard cap.

## Versions and verification

- Worker version `0.1.0`, wire `1`, SHA-256
  `08e4e057aef068997eb4efaa3717096a4f3fad54fd182a568853d8ed97a803c2`.
- Codex CLI `0.153.4`, Linux binary SHA-256
  `56ef98ab4032d317ab26e9b5e5a175650717351edb16ed9cde0cb6d1734d62da`.
- Root test collection: `179 passed, 1 skipped`.
- Codex Harness, WSL Runtime and bwrap collections: `52 passed, 3 skipped`.
- Native Windows Server suite: `22 passed, 2 skipped`; both skips are explicit
  platform/opt-in cases.
- Explicit Windows → real `wsl.exe` → final Worker → real bwrap → offline Codex
  cold-resume gate: `1 passed`.
- Independent Rust Worker: `3 passed`.
- `git diff --check`, Python compile, Bash syntax, and PowerShell AST parse passed.
- Real TCP Uvicorn SSE test proves disconnect does not cancel a Turn and reconnect
  resumes from a durable cursor without a history gap.

The final Server is stopped. Its owned Worker projections and rehearsal
workspaces are absent. Unrelated pre-existing Worker roots were not touched.

The stage checkpoints use explicit Work Order 37 pathspecs: Stage A `5a45303`,
Stage B `5b71393`, Stage C `cd5efbe`, and Stage D in the final evidence commit.
No reset, stash, push, merge, sibling-repository edit, or broad staging was used.
Source digests are retained in
[checkpoint-manifest.sha256](checkpoint-manifest.sha256).
