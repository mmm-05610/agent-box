# AgentBox Server round 1 — terminal acceptance

This document is filled stage by stage. Commands never print the bearer token;
PowerShell reads it from the protected bootstrap file into a process-local header.

## A — Windows Server and local persistence

Start from Windows Python 3.12. Choose new local Windows directories that do not
exist. Do not place the environment or data root on a UNC or WSL path.

```powershell
$SourceRoot = "\\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box-server-round1"
$EnvironmentRoot = Join-Path $env:LOCALAPPDATA "AgentBox\server-r1-env"
$DataRoot = Join-Path $env:LOCALAPPDATA "AgentBox\acceptance-server-r1"
if ((Test-Path -LiteralPath $EnvironmentRoot) -or (Test-Path -LiteralPath $DataRoot)) {
  throw "Choose new acceptance paths"
}
& "$SourceRoot\scripts\server-round1\bootstrap-windows.ps1" `
  -SourceRoot $SourceRoot -EnvironmentRoot $EnvironmentRoot
& "$SourceRoot\scripts\server-round1\accept-a.ps1" `
  -SourceRoot $SourceRoot -DataRoot $DataRoot -Port 18732 `
  -PythonExe "$EnvironmentRoot\Scripts\python.exe" -PythonPrefix ""
```

Expected terminal result:

```json
{"result":"SERVER_HTTP_R1_A_WINDOWS_OK","status":"ready","storage":"ready","api_version":"v1","persisted_profiles":1,...}
```

The tested URL is `http://127.0.0.1:18732`. Non-secret files are
`$DataRoot\.agentbox-server-root` and `$DataRoot\state\agentbox.sqlite`; the
script reports the protected token path without its content. It proves a 401
without authentication and persistence across a stop/start cycle. Add `-Cleanup`
only when the directory was created by this script and can be discarded; cleanup
checks the AgentBox owner marker first.

## B — Windows HTTP to the real WSL Worker

Build a release Worker in WSL, then pass its Windows-visible manifest path and
Linux executable path to the PowerShell acceptance. Use a new local Windows data
root and a new Linux rehearsal workspace.

```bash
AGENT_BOX_WORKER_CARGO_HOME=/tmp/agentbox-server-r1-cargo-home \
  scripts/server-round1/build-worker.sh \
  workers/agent-box-worker/.acceptance-bundle-manual
```

```powershell
$SourceRoot = "\\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box-server-round1"
$Bundle = Join-Path $SourceRoot "workers\agent-box-worker\.acceptance-bundle-manual"
& "$SourceRoot\scripts\server-round1\accept-b.ps1" `
  -SourceRoot $SourceRoot `
  -DataRoot (Join-Path $env:LOCALAPPDATA "AgentBox\acceptance-server-r1-b") `
  -ManifestPath (Join-Path $Bundle "manifest.json") `
  -LinuxWorkerPath "/home/maoqh/projects/agent-box-server-round1/workers/agent-box-worker/.acceptance-bundle-manual/agent-box-worker" `
  -WorkspaceLinuxPath "/tmp/agentbox-server-r1-manual-中文 空格" `
  -Distribution Ubuntu -Port 18733 `
  -PythonExe "$EnvironmentRoot\Scripts\python.exe" -PythonPrefix ""
```

The tested URL is `http://127.0.0.1:18733`. Expected result:

```json
{"result":"SERVER_WSL_R1_B_WINDOWS_HTTP_OK","distribution":"Ubuntu","browsed_unicode_space":true,"persisted_workspaces":1,"restart_status":"unverified",...}
```

The script reads the protected HTTP token into memory, discovers/probes/browses
through HTTP, proves a missing directory creates no record, and checks restart
state. `-Cleanup` removes only roots with the expected markers. The final tested
Worker is version `0.1.0`, wire `1`, SHA-256
`08e4e057aef068997eb4efaa3717096a4f3fad54fd182a568853d8ed97a803c2`.

## C — two real Codex Turns over HTTP/SSE

The completed acceptance used `http://127.0.0.1:18737`, Ubuntu, Codex CLI
`0.153.4`, provider `deepseek`, and model `deepseek-flash`. The exact retained
Windows data root is listed in [the C/D evidence](stage-c-d.md). For a fresh run,
first import only an explicitly authorized source file. This command confirms the
same literal source path twice and prints a non-secret credential ID:

```powershell
$SourceRoot = "\\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box-server-round1"
$DataRoot = Join-Path $env:LOCALAPPDATA "AgentBox\acceptance-server-r1-cd"
$AuthorizedSourcePath = "C:\replace-with-exact-authorized-source"
$env:PYTHONPATH = "$SourceRoot\src;$SourceRoot\plugins\agent-box-harnesses\src;$SourceRoot\plugins\agent-box-runtime-wsl\src;$SourceRoot\plugins\agent-box-sandbox-bwrap\src"
& C:\WINDOWS\py.exe -3.12 -m agent_box.server.credential_cli `
  --data-root $DataRoot --source $AuthorizedSourcePath `
  --confirm-source $AuthorizedSourcePath
```

Delete the plaintext source immediately after a successful import. Do not place
its content in a PowerShell argument, environment variable, transcript, or this
document. For the already completed acceptance, use credential ID
`credential_99d2394e2f2f460aa911bff1ee569b4c`; its plaintext source is gone.

In Windows terminal 1, configure the pinned Worker and Codex executable, then
run the Server in the foreground:

```powershell
$Bundle = Join-Path $SourceRoot "workers\agent-box-worker\.acceptance-bundle-c2"
$env:AGENT_BOX_WSL_WORKER_MANIFEST = Join-Path $Bundle "manifest.json"
$env:AGENT_BOX_WSL_WORKER_LINUX_PATH = "/home/maoqh/projects/agent-box-server-round1/workers/agent-box-worker/.acceptance-bundle-c2/agent-box-worker"
$env:AGENT_BOX_CODEX_LINUX_PATH = "/home/maoqh/.npm-global/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex"
$env:AGENT_BOX_CODEX_SHA256 = "sha256:56ef98ab4032d317ab26e9b5e5a175650717351edb16ed9cde0cb6d1734d62da"
& C:\WINDOWS\py.exe -3.12 -m agent_box.server --data-root $DataRoot --port 18737
```

In terminal 2, read the protected token path into memory, discover the listener
PID, and run the two-Turn client. Create a new, marker-owned Linux rehearsal
workspace first; never point this at a real project you are unwilling to modify.

```powershell
$BaseUrl = "http://127.0.0.1:18737"
$TokenPath = Join-Path $DataRoot "secrets\http-token"
$ReceiptPath = Join-Path $DataRoot "stage-c-receipt.json"
$WorkspaceLinuxPath = "/tmp/agentbox-server-r1-cd-manual"
& wsl.exe --distribution Ubuntu --exec /usr/bin/test -e $WorkspaceLinuxPath
if ($LASTEXITCODE -eq 0) { throw "Choose a new rehearsal workspace" }
& wsl.exe --distribution Ubuntu --exec /usr/bin/mkdir -- $WorkspaceLinuxPath
& wsl.exe --distribution Ubuntu --exec /usr/bin/touch -- `
  "$WorkspaceLinuxPath/.agentbox-server-r1-acceptance"
$ServerPid = (Get-NetTCPConnection -LocalPort 18737 -State Listen).OwningProcess
& "$SourceRoot\scripts\server-round1\accept-c.ps1" `
  -BaseUrl $BaseUrl -TokenPath $TokenPath -Distribution Ubuntu `
  -WorkspaceLinuxPath $WorkspaceLinuxPath `
  -CredentialId "credential_99d2394e2f2f460aa911bff1ee569b4c" `
  -Model "deepseek-flash" -ServerPid $ServerPid -ReceiptPath $ReceiptPath
```

Expected result:

```json
{"result":"SERVER_CODEX_R1_C_WINDOWS_OK","real_model_requests":2,"event_cursor":12,...}
```

The script creates Workspace/Profile/Session only through authenticated HTTP,
submits Turn 1, follows durable SSE, disconnects between requests, and submits
Turn 2 without the random nonce. It rejects success unless Turn 2 recalls the
nonce and the checkpoint keeps the same native thread ID.

## D — normal stop and native cold resume

Press Ctrl+C in terminal 1 and wait for Uvicorn lifespan shutdown. This is the
normal stop boundary; it cancels any active Worker attempts and closes storage.
Verify the process has exited, then start the identical Server command again with
the same `$DataRoot`. In terminal 2 run:

```powershell
& "$SourceRoot\scripts\server-round1\accept-d.ps1" `
  -BaseUrl $BaseUrl -TokenPath $TokenPath -ReceiptPath $ReceiptPath
```

Expected result:

```json
{"result":"SERVER_CODEX_R1_D_WINDOWS_OK","event_cursor":18,"stage_c_model_requests":2,"stage_d_model_requests":1,"total_real_model_requests":3,...}
```

The D client loads the persistent Session, sends no nonce, and rejects success
unless the restarted Server rebuilds a fresh bounded Worker view, invokes native
Codex resume with the Stage C thread, recalls the nonce, and preserves the native
identity. Press Ctrl+C again after the receipt. Once the Server has stopped,
remove the rehearsal workspace only after validating its marker:

```powershell
& wsl.exe --distribution Ubuntu --exec /usr/bin/test -f `
  "$WorkspaceLinuxPath/.agentbox-server-r1-acceptance"
if ($LASTEXITCODE -ne 0) { throw "Workspace cleanup refused: owner marker missing" }
& wsl.exe --distribution Ubuntu --exec /usr/bin/rm -r -- $WorkspaceLinuxPath
```

The completed run left the Server stopped and removed only its marker-owned WSL
projections and rehearsal workspace.

The three successful Turns produced result objects of 388, 382, and 383 bytes.
The latest 341-byte checkpoint and all digests are recorded in
[stage-c-d.md](stage-c-d.md). Four Codex executions were attempted overall: the
three successful DeepSeek requests plus one pre-connection DNS diagnostic. No
credential content appears in the receipt, logs, objects, argv, environment, or
events.
