# Stage C preflight — Core/Codex composition, no model call

> Historical preflight. The authorized real C/D result is recorded in
> [stage-c-d.md](stage-c-d.md).

Date: 2026-09-13. Work order: 37. Stage state remains
`SERVER_WSL_R1_B_READY` until the user authorizes one exact model and one exact
credential import source and the real two-Turn acceptance succeeds.

## Implemented path

Every accepted HTTP Turn now creates a Work and Execution, freezes typed
Workspace/Prompt/Profile/Credential inputs, and dispatches through Work Core.
The Codex Harness plugin validates the only allowed configuration fields,
builds the bounded native command, decodes JSONL, classifies native Session
paths before byte fetch, and requires the same thread identity on resume.

The first command is `codex exec --json ... -`; subsequent commands are
`codex exec resume THREAD_ID --json ... -`. The prompt is Worker stdin and is
absent from argv. The credential is a one-shot Worker secret mounted read-only
as `/runtime/home/auth.json`; it is absent from argv, environment, events, and
objects. Only classified `sessions/...THREAD_ID....jsonl` files are fetched and
published into the Windows immutable object store. Results are acknowledged
only after local result and checkpoint publication.

The product database records accepted/running/capturing/terminal state,
capture, and cleanup separately. A capture failure preserves unacknowledged
Worker results, marks Profile recovery pending, and blocks later Turns. A
Server restart seals any formerly active Turn as `unknown`; it never silently
redispatches. Completed Session checkpoints rebuild a new Worker view after a
restart. SSE reads persistent sequence-numbered events and uses an in-process
wakeup only for live delivery; disconnecting an SSE client does not cancel the
Turn.

The one-shot management command is `agent-box-server-credential`. It requires
both `--source` and an exactly resolving `--confirm-source`, imports only on
Windows, encrypts with current-user DPAPI, applies a current-SID ACL, and prints
only `credential_id` and kind. No real source has been supplied or read.

## Offline evidence

- Linux affected suite: `136 passed, 4 skipped` (the Windows/WSL platform gate
  is one of the platform skips and was run separately on Windows below).
- Independent Worker: `3 passed` Rust tests.
- Current release Worker plus real bwrap and an authorized offline fake Codex:
  `3 passed`; prompt used bounded stdin, the fixture secret used the secret
  mount, native state was listed then fetched, and success cleanup completed.
- Native Windows Server suite: `18 passed, 2 skipped` (POSIX mode and the
  explicitly enabled Windows/WSL offline gate skip in the ordinary run).
- Native Windows DPAPI round trip with generated non-credential fixture:
  `WINDOWS_DPAPI_FIXTURE_OK`; ciphertext did not contain fixture plaintext.
- Native Windows → HTTP/TestClient → real `wsl.exe` Ubuntu connector → current
  release Worker → real bwrap → offline fake Codex: `1 passed`. It completed
  two Turns with native resume, restarted the Windows Server/data root, rebuilt
  the view from the Windows checkpoint, and completed a third fake Turn with
  the same native identity. The exact marked fixture workspace and Worker
  projections were cleaned afterward.
- PowerShell C/D clients parse under Windows PowerShell 5; the shell build and
  projection cleanup scripts pass `bash -n`.
- `git diff --check` and Python compile checks pass.

The current Stage C release Worker remains protocol wire `1`, version `0.1.0`,
with digest
`sha256:10f8283082dbdf8992fa156ecc5b9c7c51d1385b852059d7e64a8417deab2772`.
It adds an optional digest-pinned executable authorization in bootstrap, so
the Worker can mount only the explicitly authorized Codex binary outside its
workspace and owned attempt root.

Real model requests: **0**. Real credential-content reads: **0**. The remaining
gate is the work-order-required user authorization of an exact model name and
an exact credential source path. The real C budget is two requests; D uses one
more after a clean stop and owned remote projection cleanup. The Codex CLI has
no hard per-request output-token flag in this path, so the acceptance prompts
request a short reply while the enforced limits remain 4 KiB input and 120
seconds.
