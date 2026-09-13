# Work Order 37 — Stage B evidence

Date: 2026-09-13. Stage A status and the current Work Order 37 were re-read
before this stage. The model and credential source remained unauthorized, so
this stage made zero model requests and read zero model credential contents.

## Result

`SERVER_WSL_R1_B_READY`

The Server now composes `agent-box-runtime-wsl` only on Windows and only when an
explicit Worker manifest and Linux executable path are configured. Windows
discovers the distribution and effective Linux user with `wsl.exe`; every
probe starts the real Worker and verifies wire version, binary digest,
connection identity, Server instance identity, capabilities, and bounds.
Probe, browse, and workspace-open idempotency is durable in the Windows product
database. Restarted Workspace connections are reported as `unverified`.

The independent Rust Worker has no Tauri, UI, `codeg_lib`, or HostBridge
dependency. It uses one `ABW1` control wire with strict JSON payloads and
separate child output. It supports bounded browse/canonicalize, chunked views,
one-shot 0600 secret fixtures, bwrap-only spawn, observe/cancel, process-group
termination, digest-pinned result fetch, repeated acknowledgement, acknowledged
cleanup, lease expiry, and attempt generations. A dedicated reader task avoids
partial-frame loss when other async branches wake.

Default limits reported by the handshake are: 64 KiB control frames, 1 MiB for
each captured stdout/stderr stream, 64 MiB artifact/view total, 32 KiB transfer
chunks, 1 MiB secret frames, 30 second default task timeout, 120 second maximum,
and 300 second unacknowledged result TTL. Tests lower only the result TTL through
the bounded Worker option. On control disconnect the Worker cancels its process
group, removes secrets and views, persists the terminal result, and launches an
owner-checked helper that deletes only the snapshotted result directories after
the TTL.

Extraction inputs, dirty-file hashes, license, and dependency decisions are in
[worker-provenance.md](worker-provenance.md).

## Native Windows → HTTP → Ubuntu evidence

The final release bundle reported:

```json
{"result":"SERVER_WSL_R1_WORKER_BUILT","workerVersion":"0.1.0","wireVersion":1,"sha256":"sha256:025f13185cd03a37432879edd78f3590047e625025e354dc76f53279c85d3338"}
```

Windows PowerShell started the actual Server at `http://127.0.0.1:18733` and
called its authenticated HTTP API. The Server discovered real `Ubuntu`, probed
effective user `maoqh`, launched the digest-pinned Linux Worker, browsed an
isolated directory containing `中文 空格`, opened exactly one Workspace, rejected
a missing directory without saving another record, restarted, and returned the
saved Workspace as `unverified`.

```json
{"result":"SERVER_WSL_R1_B_WINDOWS_HTTP_OK","distribution":"Ubuntu","effective_user":"maoqh","worker_version":"0.1.0","worker_digest":"sha256:025f13185cd03a37432879edd78f3590047e625025e354dc76f53279c85d3338","browsed_unicode_space":true,"persisted_workspaces":1,"restart_status":"unverified"}
```

The acceptance script validated both owner markers before removing its exact
Windows data root and WSL workspace. Explicit post-run checks found all three B
Windows rehearsal roots and all WSL rehearsal workspaces absent. No bearer token
value, Authorization header, secret bytes, or child stderr was recorded.

## Automated gates

```text
AGENT_BOX_TEST_WORKER=<final-release-worker> PYTHONPATH=... \
  python3 -m pytest -q plugins/agent-box-runtime-wsl/tests/test_worker_client.py
5 passed in 3.25s

CARGO_HOME=/tmp/agentbox-server-r1-cargo-home \
  cargo test --locked --manifest-path workers/agent-box-worker/Cargo.toml
3 passed; 0 failed

PYTHONPATH=src:plugins/agent-box-runtime-wsl/src:plugins/agent-box-sandbox-bwrap/src:plugins/agent-box-harnesses/src \
  python3 -m pytest -q tests/server plugins/agent-box-runtime-wsl/tests \
  tests/test_work_core_contracts.py tests/test_work_core_repository.py \
  tests/test_work_core_input_dispatch.py tests/test_work_core_finalization.py \
  tests/test_work_core_resource_observations.py tests/test_work_core_responsibility.py \
  tests/test_extensions.py tests/test_resource_contracts.py
97 passed in 5.50s

python3 -m compileall -q src plugins/agent-box-runtime-wsl/src
git diff --check
exit 0
```

The Worker test uses real `/usr/bin/bwrap`. It proves Unicode/space paths,
two-chunk and empty view files, traversal and duplicate-path rejection, one-shot
secret materialization/cleanup, controlled file reads and writes, output bytes
and SHA-256 validation before acknowledgement, repeated ack, ownership refusal,
explicit cancel, timeout, lease cancel, disconnect cancel, immediate secret
reclamation, and isolated result TTL deletion.

Real model requests: **0**. Model credential-content reads: **0**.

This stage is committed with explicit Work Order 37 pathspecs in checkpoint
`5b71393`.
