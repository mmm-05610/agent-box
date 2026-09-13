# Work Order 37 — Stage A evidence

Date: 2026-09-13. Intake HEAD: `97ca85f`. Baseline `80d2017e9a708421556914cd99d843573daf4c68`
was verified as an ancestor before implementation. The worktree was clean at intake.

## Result

`SERVER_HTTP_R1_A_READY`

The new `agent_box.server` entry point runs as a loopback-only, one-worker ASGI
service independent of Electron. It owns one marked and exclusively locked data
root, stores product and existing Core tables in `state/agentbox.sqlite`, publishes
immutable objects before database references, and keeps the bearer token in
`secrets/http-token`. On Windows the token file has inheritance removed and an
explicit full-control ACE only for the launching Windows SID.

The product API has authenticated readiness and OpenAPI export, strict DTOs,
stable error envelopes, persistent idempotency keys, Profile/Workspace/Session
records, history/SSE replay scaffolding, and typed capability failures. The default
composition enables only the official Codex profile validator when its plugin is
installed. WSL and execution remain unavailable in this checkpoint; no fake is in
the default runtime.

Core kept its existing domain and dependencies. The only Core change is a host
database-path injection seam; historical `AGENT_BOX_HOME` behavior remains the
default. Server migrations and repositories do not update Core-owned tables.

## Platform evidence

Windows PowerShell 5.1 reported Python 3.12.10, SQLite 3.49.1, FastAPI 0.136.1,
Uvicorn 0.32.1, and Pydantic 2.10.3. The native Windows acceptance started the
actual HTTP server at `http://127.0.0.1:18732`, observed unauthenticated 401,
created a Codex Profile through HTTP, stopped and restarted against the same
local data root, and read the same Profile and bootstrap-token identity afterward.
The final run first created a clean local Windows venv from
`lockfiles/server-windows-py312.txt`, then ran the Server with that interpreter.

Observed result:

```json
{"result":"SERVER_HTTP_R1_WINDOWS_ENV_READY","python":"C:\\Users\\maoqh\\AppData\\Local\\Temp\\agentbox-server-r1-env-7edee72f997041b08d142cbb0062accd\\Scripts\\python.exe","lockfile":"\\\\wsl.localhost\\Ubuntu\\home\\maoqh\\projects\\agent-box-server-round1\\lockfiles\\server-windows-py312.txt"}
{"result":"SERVER_HTTP_R1_A_WINDOWS_OK","status":"ready","storage":"ready","api_version":"v1","persisted_profiles":1,"token_path":"C:\\Users\\maoqh\\AppData\\Local\\Temp\\agentbox-server-r1-data-7edee72f997041b08d142cbb0062accd\\secrets\\http-token","database_path":"C:\\Users\\maoqh\\AppData\\Local\\Temp\\agentbox-server-r1-data-7edee72f997041b08d142cbb0062accd\\state\\agentbox.sqlite"}
```

The script validated the owner marker before cleanup. A separate `Test-Path`
check on the preceding run and the final explicit check
`NO_WINDOWS_VENV_OR_DATA_RESIDUAL` left no Stage A Windows venv, data root, or
log residual. No token value was printed or recorded.

## Automated gates

```text
PYTHONPATH=src python3 -m pytest -q tests/server \
  tests/test_work_core_contracts.py tests/test_work_core_repository.py \
  tests/test_work_core_input_dispatch.py tests/test_work_core_finalization.py \
  tests/test_work_core_resource_observations.py \
  tests/test_work_core_responsibility.py tests/test_extensions.py \
  tests/test_resource_contracts.py
92 passed in 0.74s

python3 -m compileall -q src
exit 0

git diff --check
exit 0
```

The tests cover unauthorized access; independent Host and Origin rejection;
authenticated OpenAPI; strict extra-field rejection; persistent idempotency and
conflict; restart persistence; future-schema fail-closed behavior; separate roots
and exclusive ownership; refusal of an existing unmarked directory; owner-only
POSIX token mode; object-publication failure before DB reference; and the Core
database injection seam.

Real model requests: **0**. Model credential-content reads: **0**. Model,
credential import source, and real Codex execution remain blocked for Stage C.

Checkpoint creation was attempted with explicit pathspecs after all gates. Git
could not create the worktree `index.lock` because the managed environment exposes
the parent repository's `.git/worktrees/agent-box-server-round1` metadata read-only.
No path was staged. The Stage A tree and evidence remain intact for a later
checkpoint when that Git metadata is writable.
