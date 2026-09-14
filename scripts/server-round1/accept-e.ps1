param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string]$SourceLinuxPath,
    [Parameter(Mandatory = $true)][string]$DataRoot,
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [Parameter(Mandatory = $true)][string]$LinuxWorkerPath,
    [Parameter(Mandatory = $true)][string]$WorkspaceLinuxPath,
    [string]$Distribution = "Ubuntu",
    [int]$Port = 18741,
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

$workspaceMarker = "$WorkspaceLinuxPath/.agentbox-server-r1-acceptance-e"
& wsl.exe --distribution $Distribution --exec /usr/bin/test -e $WorkspaceLinuxPath
if ($LASTEXITCODE -eq 0) {
    throw "WorkspaceLinuxPath must not exist before this acceptance run: $WorkspaceLinuxPath"
}
& wsl.exe --distribution $Distribution --exec /usr/bin/mkdir -p -- "$WorkspaceLinuxPath/assets"
if ($LASTEXITCODE -ne 0) { throw "Could not create the isolated WSL workspace" }
& wsl.exe --distribution $Distribution --exec /usr/bin/touch -- $workspaceMarker
if ($LASTEXITCODE -ne 0) { throw "Could not mark the isolated WSL workspace" }
& wsl.exe --distribution $Distribution --exec /usr/bin/cp -- `
    "$SourceLinuxPath/plugins/agent-box-harnesses/tests/harness_remote/fake_acp_peer.mjs" `
    "$WorkspaceLinuxPath/fake_acp_peer.mjs"
if ($LASTEXITCODE -ne 0) { throw "Could not project the explicit no-model ACP fixture" }
& wsl.exe --distribution $Distribution --exec /usr/bin/cp -- `
    "$SourceLinuxPath/pyproject.toml" "$WorkspaceLinuxPath/assets/reference.png"
if ($LASTEXITCODE -ne 0) { throw "Could not project the attachment fixture" }

$env:PYTHONPATH = (Join-Path $SourceRoot "src") + ";" + `
    (Join-Path $SourceRoot "plugins/agent-box-harnesses/src") + ";" + `
    (Join-Path $SourceRoot "plugins/agent-box-runtime-wsl/src") + ";" + `
    (Join-Path $SourceRoot "plugins/agent-box-sandbox-bwrap/src")
$env:AGENT_BOX_WSL_WORKER_MANIFEST = $ManifestPath
$env:AGENT_BOX_WSL_WORKER_LINUX_PATH = $LinuxWorkerPath

$pluginRoot = Join-Path $SourceRoot "plugins/agent-box-harnesses"
$deploymentPath = Join-Path ([IO.Path]::GetTempPath()) `
    ("agentbox-sidecar-e-" + [guid]::NewGuid().ToString("N") + ".json")
$deployment = [ordered]@{
    schemaVersion = 1
    pluginRoot = $pluginRoot
    harnesses = @([ordered]@{
        id = "pi"
        capabilityClaims = [ordered]@{ streaming = $true; approvals = $true; attachments = $true }
        controlOptions = [ordered]@{ model = @("fixture-model") }
        adapter = [ordered]@{
            command = "/usr/bin/node"
            args = @("/workspace/fake_acp_peer.mjs")
        }
        timeoutMs = 30000
    })
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText(
    $deploymentPath, ($deployment | ConvertTo-Json -Depth 10 -Compress), $utf8NoBom
)

$baseUrl = "http://127.0.0.1:$Port"
$logStem = Join-Path ([IO.Path]::GetTempPath()) `
    ("agentbox-server-e-" + [guid]::NewGuid().ToString("N"))
$stdoutPath = $logStem + ".stdout.log"
$stderrPath = $logStem + ".stderr.log"
$process = $null
$socket = $null
$requestCounter = 0

function Start-AgentBoxServer {
    $quotedRoot = '"' + $DataRoot + '"'
    $quotedDeployment = '"' + $deploymentPath + '"'
    $arguments = (($PythonPrefix + " -m agent_box.server --data-root $quotedRoot " +
        "--port $Port --sidecar-deployment $quotedDeployment").Trim())
    return Start-Process -FilePath $PythonExe -ArgumentList $arguments -PassThru `
        -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
}

function Wait-Liveness {
    param([System.Diagnostics.Process]$Process)
    for ($attempt = 0; $attempt -lt 150; $attempt++) {
        if ($Process.HasExited) { throw "Server exited before liveness; inspect $stderrPath" }
        try { return Invoke-RestMethod -Uri "$baseUrl/live" -TimeoutSec 1 } `
        catch { Start-Sleep -Milliseconds 100 }
    }
    throw "Server did not become live; inspect $stderrPath"
}

function Invoke-Wire {
    param([string]$Method, [hashtable]$Params, [hashtable]$Headers)
    $script:requestCounter += 1
    $body = [ordered]@{
        jsonrpc = "2.0"
        id = "accept-e-$script:requestCounter"
        method = $Method
        params = $Params
    }
    $answer = Invoke-RestMethod -Method Post -Uri "$baseUrl/wire/v1/$Method" `
        -Headers $Headers -ContentType "application/json" `
        -Body ($body | ConvertTo-Json -Depth 14 -Compress)
    if ($null -ne $answer.error) {
        throw "wire method $Method failed: $($answer.error.code)"
    }
    return $answer.result
}

function Wait-TurnState {
    param([string]$SessionId, [string]$ExecutionId, [string[]]$States, [hashtable]$Headers)
    for ($attempt = 0; $attempt -lt 200; $attempt++) {
        $session = Invoke-RestMethod -Uri "$baseUrl/api/v1/sessions/$SessionId" -Headers $Headers
        $turn = @($session.turns | Where-Object { $_.id -eq $ExecutionId })[0]
        if ($null -ne $turn -and $States -contains $turn.state) { return $turn }
        Start-Sleep -Milliseconds 50
    }
    throw "Execution $ExecutionId did not reach $($States -join ',')"
}

function Receive-WireDelta {
    param([System.Net.WebSockets.ClientWebSocket]$Socket)
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $buffer = New-Object byte[] 65536
        $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
        $timeout = New-Object System.Threading.CancellationTokenSource
        $timeout.CancelAfter(10000)
        $received = $Socket.ReceiveAsync($segment, $timeout.Token).GetAwaiter().GetResult()
        if ($received.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
            throw "wire event stream closed before a delta"
        }
        $json = [Text.Encoding]::UTF8.GetString($buffer, 0, $received.Count)
        $frame = $json | ConvertFrom-Json
        if ($frame.event.kind -eq "message.delta") { return $frame }
    }
    throw "wire event stream did not deliver a persisted message.delta"
}

try {
    $process = Start-AgentBoxServer
    $null = Wait-Liveness -Process $process
    $tokenPath = Join-Path $DataRoot "secrets/http-token"
    $token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
    $auth = @{ Authorization = "Bearer $token" }

    $hello = Invoke-Wire -Method "server.hello" -Headers $auth -Params @{
        clientVersions = @("wire/1"); clientPresentationSupports = @("wire.eventStream/1")
    }
    if ($hello.protocolVersion -ne "wire/1") { throw "wire/1 was not negotiated" }

    $opened = Invoke-Wire -Method "workspaces.open" -Headers $auth -Params @{
        requestId = "accept-e-open-workspace"
        environment = @{ kind = "wsl"; host = $Distribution; user = $null }
        path = $WorkspaceLinuxPath
    }
    if (-not $opened.workspace.accessibility.readable) { throw "Workspace is not readable" }

    $providerModel = Invoke-Wire -Method "providerModels.create" -Headers $auth -Params @{
        requestId = "accept-e-provider-model"
        displayName = "No-model fixture provider"
        harness = "pi"
        provider = "fixture"
        credentialId = $null
        configuration = @()
        models = @(@{
            modelId = "fixture-model"; displayName = "Fixture model"
            availability = "unknown"; unavailableReason = $null
        })
    }
    $profileCreated = Invoke-Wire -Method "profiles.create" -Headers $auth -Params @{
        requestId = "accept-e-profile-create"
        displayName = "Windows sidecar acceptance"
        harness = "pi"
    }
    $profileUpdated = Invoke-Wire -Method "profiles.update" -Headers $auth -Params @{
        requestId = "accept-e-profile-update"
        profileId = $profileCreated.profile.id
        expectedVersion = $profileCreated.profile.version
        displayName = "Windows sidecar acceptance updated"
    }
    $profileConfigured = Invoke-Wire -Method "profiles.updateConfig" -Headers $auth -Params @{
        requestId = "accept-e-profile-config"
        profileId = $profileUpdated.profile.id
        expectedVersion = $profileUpdated.profile.version
        values = @(@{
            controlId = "model"
            value = @{ providerId = $providerModel.providerModel.id; modelId = "fixture-model" }
        })
    }
    if ($profileConfigured.effectiveFor -ne "next_send") {
        throw "Profile configuration did not retain next-send timing"
    }
    $profile = $profileConfigured.profile
    $described = Invoke-Wire -Method "config.describe" -Headers $auth `
        -Params @{ profileId = $profile.id; workspaceId = $opened.workspace.id }
    if ($described.descriptor.profileId -ne $profile.id) {
        throw "Configuration description was absent or crossed Profile scope"
    }
    $rejected = Invoke-Wire -Method "config.resolve" -Headers $auth -Params @{
        profileId = $profile.id; workspaceId = $opened.workspace.id
        overrides = @(@{ controlId = "unknown-control"; value = "x" })
    }
    if ($rejected.outcome -ne "rejected") { throw "Invalid configuration was not rejected" }

    $first = Invoke-Wire -Method "sessions.createAndSend" -Headers $auth -Params @{
        requestId = "accept-e-send-attachment"
        workspaceId = $opened.workspace.id
        profileId = $profile.id
        overrides = @()
        message = @{
            text = "Windows Worker attachment gate"
            attachments = @(@{
                ref = "assets/reference.png"; displayName = "reference.png"; mediaKind = "image"
            })
        }
    }
    $null = Wait-TurnState -SessionId $first.session.id -ExecutionId $first.executionId `
        -States @("completed") -Headers $auth
    $snapshot = Invoke-Wire -Method "history.snapshot" -Headers $auth `
        -Params @{ sessionId = $first.session.id }
    if (@($snapshot.frames | Where-Object { $_.event.kind -eq "message.delta" }).Count -lt 1) {
        throw "No persisted pre-terminal delta was found"
    }
    $userFrames = @($snapshot.frames | Where-Object {
        $_.event.kind -eq "message.final" -and $_.event.role -eq "user" -and `
        $_.event.displayKind -eq "visible"
    })
    if ($userFrames.Count -ne 1 -or $userFrames[0].event.text -ne "Windows Worker attachment gate") {
        throw "Accepted user message was not recoverable from Server history"
    }
    if (-not ($snapshot.PSObject.Properties.Name -contains "olderCursor")) {
        throw "History did not expose the distinct backward-page cursor"
    }
    $sessionList = Invoke-Wire -Method "sessions.list" -Headers $auth -Params @{
        workspaceId = $opened.workspace.id; includeArchived = $false; page = @{ limit = 1 }
    }
    if ($sessionList.items.Count -ne 1 -or $sessionList.items[0].id -ne $first.session.id) {
        throw "Session was not discoverable from the authoritative catalog"
    }
    $sessionUpdated = Invoke-Wire -Method "sessions.update" -Headers $auth -Params @{
        requestId = "accept-e-session-update"
        sessionId = $first.session.id
        expectedVersion = $sessionList.items[0].version
        displayName = "Windows full vertical"
        pinned = $true
    }
    if (-not $sessionUpdated.session.pinned -or `
        $sessionUpdated.session.displayName -ne "Windows full vertical") {
        throw "Session shared metadata was not persisted"
    }

    $second = Invoke-Wire -Method "sessions.send" -Headers $auth -Params @{
        requestId = "accept-e-send-cancel"
        sessionId = $first.session.id
        overrides = @()
        message = @{ text = "wait-for-cancel"; attachments = @() }
    }
    $socket = New-Object System.Net.WebSockets.ClientWebSocket
    $socket.Options.SetRequestHeader("Authorization", "Bearer $token")
    $cursor = [uri]::EscapeDataString($snapshot.resumeCursor)
    $uri = New-Object System.Uri("ws://127.0.0.1:$Port/wire/v1/event-stream?sessionId=$($first.session.id)&cursor=$cursor")
    $null = $socket.ConnectAsync($uri, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $delta = Receive-WireDelta -Socket $socket
    if ($delta.sessionId -ne $first.session.id) { throw "wire event stream crossed Session scope" }
    $stopped = Invoke-Wire -Method "runs.stop" -Headers $auth -Params @{
        requestId = "accept-e-stop-execution"
        sessionId = $first.session.id
        executionId = $second.executionId
    }
    if ($stopped.outcome -ne "stop_requested") { throw "Stop was not confirmed as requested" }
    $cancelled = Wait-TurnState -SessionId $first.session.id -ExecutionId $second.executionId `
        -States @("cancelled") -Headers $auth
    if ($null -eq $cancelled.stop_requested_at) { throw "Stop intent was not persisted" }
    $socket.Dispose()
    $socket = $null

    $third = Invoke-Wire -Method "sessions.send" -Headers $auth -Params @{
        requestId = "accept-e-send-approval"
        sessionId = $first.session.id
        overrides = @()
        message = @{ text = "needs-permission"; attachments = @() }
    }
    $approval = $null
    for ($attempt = 0; $attempt -lt 100; $attempt++) {
        $approvalSnapshot = Invoke-Wire -Method "history.snapshot" -Headers $auth `
            -Params @{ sessionId = $first.session.id }
        $approvalFrames = @($approvalSnapshot.frames | Where-Object {
            $_.event.kind -eq "approval.requested" -and `
            $_.event.approval.executionId -eq $third.executionId
        })
        if ($approvalFrames.Count -gt 0) {
            $approval = $approvalFrames[-1].event.approval
            break
        }
        Start-Sleep -Milliseconds 50
    }
    if ($null -eq $approval -or $null -eq $approval.expiresAt) {
        throw "Bounded approval request was not persisted with expiry"
    }
    $decision = Invoke-Wire -Method "approvals.decide" -Headers $auth -Params @{
        requestId = "accept-e-approval-decision"
        approvalId = $approval.approvalId
        decision = "allow"
        scope = @{ kind = "once" }
        expectedVersion = $approval.version
    }
    if ($decision.outcome -ne "recorded") { throw "Approval decision was not recorded" }
    $null = Wait-TurnState -SessionId $first.session.id -ExecutionId $third.executionId `
        -States @("completed") -Headers $auth
    $currentSessions = Invoke-Wire -Method "sessions.list" -Headers $auth -Params @{
        workspaceId = $opened.workspace.id; includeArchived = $false
    }
    $currentSession = @($currentSessions.items | Where-Object { $_.id -eq $first.session.id })[0]
    if ($null -eq $currentSession) { throw "Session disappeared before archive" }
    $sessionArchived = Invoke-Wire -Method "sessions.archive" -Headers $auth -Params @{
        requestId = "accept-e-session-archive"
        sessionId = $first.session.id
        expectedVersion = $currentSession.version
    }
    if ($null -eq $sessionArchived.session.archivedAt) {
        throw "Session archive was not persisted"
    }
    $archivedSessions = Invoke-Wire -Method "sessions.list" -Headers $auth -Params @{
        workspaceId = $opened.workspace.id; includeArchived = $true
    }
    if (@($archivedSessions.items | Where-Object { $_.id -eq $first.session.id }).Count -ne 1) {
        throw "Archived Session identity was not retained"
    }
    $historyAfterArchive = Invoke-Wire -Method "history.snapshot" -Headers $auth `
        -Params @{ sessionId = $first.session.id }
    if ($historyAfterArchive.frames.Count -lt $snapshot.frames.Count) {
        throw "Session archive removed retained history"
    }
    $profileArchived = Invoke-Wire -Method "profiles.archive" -Headers $auth -Params @{
        requestId = "accept-e-profile-archive"
        profileId = $profile.id
        expectedVersion = $profile.version
    }
    if ($null -eq $profileArchived.profile.archivedAt) { throw "Profile archive was not persisted" }
    $providerArchived = Invoke-Wire -Method "providerModels.archive" -Headers $auth -Params @{
        requestId = "accept-e-provider-archive"
        providerModelId = $providerModel.providerModel.id
        expectedVersion = $providerModel.providerModel.version
    }
    if ($null -eq $providerArchived.providerModel.archivedAt) {
        throw "Provider/Model archive was not persisted"
    }

    [pscustomobject]@{
        result = "BACKEND_41_E_WINDOWS_WSL_WIRE_OK"
        windows_server = $true
        distribution = $Distribution
        server_id = $hello.serverId
        workspace_id = $opened.workspace.id
        session_id = $first.session.id
        attachment_execution = $first.executionId
        cancelled_execution = $second.executionId
        approval_execution = $third.executionId
        profile_id = $profile.id
        provider_model_id = $providerModel.providerModel.id
        wire_event_stream = "wire.eventStream/1"
        worker_digest = ((Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json).sha256)
        data_root = $DataRoot
        workspace = $WorkspaceLinuxPath
        fixture = "explicit no-model ACP peer"
    } | ConvertTo-Json -Compress
} finally {
    if ($null -ne $socket) { $socket.Dispose() }
    if ($null -ne $process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
        $process.WaitForExit()
    }
    Remove-Item -LiteralPath $stdoutPath, $stderrPath, $deploymentPath `
        -Force -ErrorAction SilentlyContinue
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
