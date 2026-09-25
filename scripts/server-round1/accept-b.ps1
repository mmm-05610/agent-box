param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string]$DataRoot,
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [Parameter(Mandatory = $true)][string]$LinuxWorkerPath,
    [Parameter(Mandatory = $true)][string]$WorkspaceLinuxPath,
    [string]$Distribution = "Ubuntu",
    [int]$Port = 18733,
    [string]$PythonExe = "py.exe",
    [string]$PythonPrefix = "-3.12",
    [switch]$Cleanup
)

$ErrorActionPreference = "Stop"
if (Test-Path -LiteralPath $DataRoot) {
    throw "DataRoot must not exist before this acceptance run: $DataRoot"
}
if (-not (Test-Path -LiteralPath $ManifestPath)) {
    throw "Worker manifest is unavailable to Windows: $ManifestPath"
}

& wsl.exe --distribution $Distribution --exec /usr/bin/test -e $WorkspaceLinuxPath
if ($LASTEXITCODE -eq 0) {
    throw "WorkspaceLinuxPath must not exist before this acceptance run: $WorkspaceLinuxPath"
}
& wsl.exe --distribution $Distribution --exec /usr/bin/mkdir -- $WorkspaceLinuxPath
if ($LASTEXITCODE -ne 0) { throw "Could not create the isolated WSL workspace" }
$workspaceMarker = "$WorkspaceLinuxPath/.agentbox-server-r1-acceptance"
& wsl.exe --distribution $Distribution --exec /usr/bin/touch -- $workspaceMarker
if ($LASTEXITCODE -ne 0) { throw "Could not mark the isolated WSL workspace" }
$unicodeChild = "$WorkspaceLinuxPath/中文 空格"
& wsl.exe --distribution $Distribution --exec /usr/bin/mkdir -- $unicodeChild
if ($LASTEXITCODE -ne 0) { throw "Could not create the Unicode acceptance directory" }

$env:PYTHONPATH = (Join-Path $SourceRoot "src") + ";" + `
    (Join-Path $SourceRoot "plugins/agent-box-harness/src") + ";" + `
    (Join-Path $SourceRoot "plugins/agent-box-runtime-wsl/src") + ";" + `
    (Join-Path $SourceRoot "plugins/agent-box-sandbox-bwrap/src")
$env:AGENT_BOX_WSL_WORKER_MANIFEST = $ManifestPath
$env:AGENT_BOX_WSL_WORKER_LINUX_PATH = $LinuxWorkerPath
$baseUrl = "http://127.0.0.1:$Port"
$logStem = Join-Path ([IO.Path]::GetTempPath()) ("agentbox-server-b-" + [guid]::NewGuid().ToString("N"))
$stdoutPath = $logStem + ".stdout.log"
$stderrPath = $logStem + ".stderr.log"
$process = $null

function Start-AgentBoxServer {
    $quotedRoot = '"' + $DataRoot + '"'
    $arguments = (($PythonPrefix + " -m agent_box.server --data-root $quotedRoot --port $Port").Trim())
    return Start-Process -FilePath $PythonExe -ArgumentList $arguments -PassThru `
        -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
}

function Wait-Liveness {
    param([System.Diagnostics.Process]$Process)
    for ($attempt = 0; $attempt -lt 100; $attempt++) {
        if ($Process.HasExited) { throw "Server exited before liveness; inspect $stderrPath" }
        try { return Invoke-RestMethod -Uri "$baseUrl/live" -TimeoutSec 1 } catch { Start-Sleep -Milliseconds 100 }
    }
    throw "Server did not become live; inspect $stderrPath"
}

function Invoke-JsonPost {
    param([string]$Path, [hashtable]$Headers, [hashtable]$Body)
    $json = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 6 -Compress))
    return Invoke-RestMethod -Method Post -Uri ($baseUrl + $Path) -Headers $Headers `
        -ContentType "application/json; charset=utf-8" -Body $json
}

try {
    $process = Start-AgentBoxServer
    $null = Wait-Liveness -Process $process
    $tokenPath = Join-Path $DataRoot "secrets/http-token"
    $token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
    $auth = @{ Authorization = "Bearer $token" }

    $ready = Invoke-RestMethod -Uri "$baseUrl/api/v1/readiness" -Headers $auth
    if (-not $ready.capabilities.wsl) { throw "WSL capability was not composed" }
    $distributions = Invoke-RestMethod -Uri "$baseUrl/api/v1/wsl/distributions" -Headers $auth
    if (@($distributions.items | Where-Object { $_.name -eq $Distribution }).Count -ne 1) {
        throw "Requested WSL distribution was not discovered"
    }

    $probe = Invoke-JsonPost -Path "/api/v1/connections/probe" `
        -Headers @{ Authorization = "Bearer $token"; "Idempotency-Key" = "accept-b-probe" } `
        -Body @{ kind = "wsl"; distribution = $Distribution }
    $browse = Invoke-JsonPost -Path "/api/v1/connections/browse" `
        -Headers @{ Authorization = "Bearer $token"; "Idempotency-Key" = "accept-b-browse" } `
        -Body @{ probe_id = $probe.probe_id; path = $WorkspaceLinuxPath }
    if (@($browse.directories | Where-Object { $_ -eq "中文 空格" }).Count -ne 1) {
        throw "Unicode/space child was not returned by the real Worker"
    }

    $workspace = Invoke-JsonPost -Path "/api/v1/workspaces" `
        -Headers @{ Authorization = "Bearer $token"; "Idempotency-Key" = "accept-b-open" } `
        -Body @{ probe_id = $probe.probe_id; path = $WorkspaceLinuxPath }
    $beforeFailure = Invoke-RestMethod -Uri "$baseUrl/api/v1/workspaces" -Headers $auth
    try {
        $null = Invoke-JsonPost -Path "/api/v1/workspaces" `
            -Headers @{ Authorization = "Bearer $token"; "Idempotency-Key" = "accept-b-missing" } `
            -Body @{ probe_id = $probe.probe_id; path = "$WorkspaceLinuxPath/missing" }
        throw "Opening a missing directory unexpectedly succeeded"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -notin @(404, 422)) { throw }
    }
    $afterFailure = Invoke-RestMethod -Uri "$baseUrl/api/v1/workspaces" -Headers $auth
    if ($beforeFailure.items.Count -ne 1 -or $afterFailure.items.Count -ne 1) {
        throw "Failed workspace open changed persistent records"
    }

    Stop-Process -Id $process.Id
    $process.WaitForExit()
    $process = Start-AgentBoxServer
    $null = Wait-Liveness -Process $process
    $restarted = Invoke-RestMethod -Uri "$baseUrl/api/v1/workspaces" -Headers $auth
    if ($restarted.items.Count -ne 1 -or $restarted.items[0].connection_state -ne "unverified") {
        throw "Restarted workspace did not report unverified connection state"
    }

    [pscustomobject]@{
        result = "SERVER_WSL_R1_B_WINDOWS_HTTP_OK"
        distribution = $probe.distribution
        effective_user = $probe.user
        worker_version = $probe.worker_version
        worker_digest = $probe.worker_digest
        browsed_unicode_space = $true
        persisted_workspaces = $restarted.items.Count
        restart_status = $restarted.items[0].connection_state
        workspace_id = $workspace.workspace_id
        database_path = (Join-Path $DataRoot "state/agentbox.sqlite")
    } | ConvertTo-Json -Compress
} finally {
    if ($null -ne $process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
        $process.WaitForExit()
    }
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    if ($Cleanup -and (Test-Path -LiteralPath $DataRoot)) {
        $marker = Join-Path $DataRoot ".agentbox-server-root"
        $markerText = (Get-Content -LiteralPath $marker -Raw) -replace "`r`n", "`n"
        if ($markerText -eq "agentbox-server-r1`n") {
            Remove-Item -LiteralPath $DataRoot -Recurse -Force
        } else {
            throw "Data cleanup refused: owner marker mismatch"
        }
    }
    if ($Cleanup) {
        & wsl.exe --distribution $Distribution --exec /usr/bin/test -f $workspaceMarker
        if ($LASTEXITCODE -ne 0) { throw "Workspace cleanup refused: owner marker missing" }
        & wsl.exe --distribution $Distribution --exec /usr/bin/rm -r -- $WorkspaceLinuxPath
        if ($LASTEXITCODE -ne 0) { throw "Workspace cleanup failed" }
    }
}
