param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string]$SourceLinuxPath,
    [Parameter(Mandatory = $true)][string]$DataRoot,
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [Parameter(Mandatory = $true)][string]$WireSchemaPath,
    [Parameter(Mandatory = $true)][string]$LinuxWorkerPath,
    [Parameter(Mandatory = $true)][string]$WorkspaceLinuxPath,
    [string]$Distribution = "Ubuntu",
    [int]$Port = 18741,
    [string]$PythonExe = "py.exe",
    [string]$PythonPrefix = "-3.12",
    [switch]$Cleanup,
    [switch]$PostCheck,
    [string[]]$InstanceId = @()
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Cleanup guards.
#
# The cleanup path at the end of this script and the negative self-check below
# call the same functions, so a refusal observed by the self-check is the same
# refusal a real cleanup performs. Nothing here decides by itself that a path is
# disposable: the owner marker, the directory identity and the absence of a
# reparse point are all re-read from the filesystem at the moment of removal.
# ---------------------------------------------------------------------------

function Assert-OwnerMarkedDataRoot {
    param([Parameter(Mandatory = $true)][string]$Path)
    $item = Get-Item -LiteralPath $Path -Force
    if (-not $item.PSIsContainer -or
        (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
        throw "Data cleanup refused: data root is not a real directory"
    }
    $marker = Join-Path $Path ".agentbox-server-root"
    if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) {
        throw "Data cleanup refused: owner marker missing"
    }
    $markerItem = Get-Item -LiteralPath $marker -Force
    if (($markerItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Data cleanup refused: owner marker is a link"
    }
    $markerText = (Get-Content -LiteralPath $marker -Raw) -replace "`r`n", "`n"
    if ($markerText -ne "agentbox-server-r1`n") {
        throw "Data cleanup refused: owner marker mismatch"
    }
}

function Test-CleanableDataRoot {
    param([Parameter(Mandatory = $true)][string]$Path)
    try { Assert-OwnerMarkedDataRoot -Path $Path; return $true } catch { return $false }
}

function Assert-MarkedWorkspace {
    param([string]$Distribution, [string]$MarkerPath)
    & wsl.exe --distribution $Distribution --exec /usr/bin/test -f $MarkerPath
    if ($LASTEXITCODE -ne 0) { throw "Workspace cleanup refused: owner marker missing" }
}

function Test-ResidualProcesses {
    param([string]$DataRoot, [string]$Distribution, [string[]]$InstanceIds = @())
    $found = @()
    $windows = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -match '^(python|pythonw|py)\.exe$' -and $_.CommandLine -and
            $_.CommandLine.Contains($DataRoot)
        })
    foreach ($item in $windows) { $found += "windows:pid=$($item.ProcessId) $($item.Name)" }
    $scoped = @($InstanceIds | Where-Object { $_ })
    $pattern = if ($scoped.Count) {
        (($scoped | ForEach-Object { "agentbox-worker-r1/$_" }) -join "|")
    } else {
        # Unscoped fallback: the Worker root prefix only. Matching on the binary
        # name as well would also match this acceptance command line and the
        # Worker copies other test runs are still holding open.
        "agentbox-worker-r1"
    }
    $lines = @(& wsl.exe --distribution $Distribution --exec /usr/bin/pgrep -af $pattern)
    foreach ($line in $lines) {
        $text = "$line".Trim()
        # The wsl.exe host running this very query carries the pattern in its own
        # command line, and the shell that launched the acceptance carries the
        # script name. Neither is a Worker or a sidecar.
        if ($text -and $text -notmatch "/usr/bin/pgrep " -and $text -notmatch "accept-e\.ps1") {
            $found += "wsl:$text"
        }
    }
    return $found
}

function Get-WorkerViewResidue {
    # Views and secrets are per-execution Worker projections: a clean stop leaves
    # neither behind.
    param([string]$Distribution, [string[]]$InstanceIds = @())
    $scoped = @($InstanceIds | Where-Object { $_ })
    if ($scoped.Count -eq 0) { return @() }
    $residue = @()
    foreach ($instance in $scoped) {
        $root = "/tmp/agentbox-worker-r1/$instance"
        & wsl.exe --distribution $Distribution --exec /usr/bin/test -d $root
        if ($LASTEXITCODE -ne 0) { continue }
        $found = @(& wsl.exe --distribution $Distribution --exec /usr/bin/find $root `
            -maxdepth 3 -type d "(" -name views -o -name secrets ")" |
            ForEach-Object { "$_".Trim() } | Where-Object { $_ })
        $residue += $found
    }
    return $residue
}

# Negative case for the guards: every path below must be refused, and each is
# constructed by the check itself so no real data root is ever at risk.
function Invoke-CleanupGuardChecks {
    param([string]$Distribution, [string]$WorkspaceLinuxPath)
    $probeRoot = Join-Path ([IO.Path]::GetTempPath()) `
        ("agentbox-guard-" + [guid]::NewGuid().ToString("N"))
    $workspaceProbe = "$WorkspaceLinuxPath-guard-$([guid]::NewGuid().ToString('N'))"
    $results = [ordered]@{}
    try {
        New-Item -ItemType Directory -Path $probeRoot | Out-Null

        $unowned = Join-Path $probeRoot "unowned"
        New-Item -ItemType Directory -Path $unowned | Out-Null
        $results.data_root_without_owner_marker_refused = -not (Test-CleanableDataRoot -Path $unowned)

        $mismatched = Join-Path $probeRoot "mismatched"
        New-Item -ItemType Directory -Path $mismatched | Out-Null
        [IO.File]::WriteAllText((Join-Path $mismatched ".agentbox-server-root"), "agentbox-server-r9`n")
        $results.data_root_with_mismatched_marker_refused = -not (Test-CleanableDataRoot -Path $mismatched)

        $owned = Join-Path $probeRoot "owned"
        New-Item -ItemType Directory -Path $owned | Out-Null
        [IO.File]::WriteAllText((Join-Path $owned ".agentbox-server-root"), "agentbox-server-r1`n")
        $results.data_root_with_owner_marker_accepted = Test-CleanableDataRoot -Path $owned

        $link = Join-Path $probeRoot "linked"
        New-Item -ItemType Junction -Path $link -Target $owned | Out-Null
        $results.linked_data_root_target_refused = -not (Test-CleanableDataRoot -Path $link)

        $file = Join-Path $probeRoot "not-a-directory"
        [IO.File]::WriteAllText($file, "agentbox-server-r1`n")
        $results.data_root_that_is_not_a_directory_refused = -not (Test-CleanableDataRoot -Path $file)

        & wsl.exe --distribution $Distribution --exec /usr/bin/mkdir -p -- $workspaceProbe
        if ($LASTEXITCODE -ne 0) { throw "Could not create the workspace guard probe" }
        $marker = "$workspaceProbe/.agentbox-server-r1-acceptance-e"
        try {
            Assert-MarkedWorkspace -Distribution $Distribution -MarkerPath $marker
            $results.workspace_without_owner_marker_refused = $false
        } catch { $results.workspace_without_owner_marker_refused = $true }
        & wsl.exe --distribution $Distribution --exec /usr/bin/touch -- $marker
        if ($LASTEXITCODE -ne 0) { throw "Could not mark the workspace guard probe" }
        try {
            Assert-MarkedWorkspace -Distribution $Distribution -MarkerPath $marker
            $results.marked_workspace_accepted = $true
        } catch { $results.marked_workspace_accepted = $false }

        $failed = @($results.Keys | Where-Object { "$_" -match '_refused$|_accepted$' -and $results[$_] -eq $false })
        if ($failed.Count -ne 0) {
            throw "Cleanup guard checks failed: $($failed -join ', ')"
        }
        # Delete the junction itself, never through it: a recursive delete that
        # followed the reparse point would be the very hazard under test.
        (Get-Item -LiteralPath $link -Force).Delete()
        return $results
    } finally {
        Remove-Item -LiteralPath $probeRoot -Recurse -Force -ErrorAction SilentlyContinue
        & wsl.exe --distribution $Distribution --exec /usr/bin/test -d $workspaceProbe
        if ($LASTEXITCODE -eq 0) {
            & wsl.exe --distribution $Distribution --exec /usr/bin/rm -r -- $workspaceProbe
        }
    }
}

if ($PostCheck) {
    # Independent after-the-fact verification: this runs as its own process,
    # after the acceptance process has exited, so its own children cannot mask a
    # leftover.
    $report = [ordered]@{}
    $report.check = "BACKEND_41_E_WINDOWS_POSTCHECK"
    $report.data_root = $DataRoot
    $report.workspace = $WorkspaceLinuxPath
    $report.port = $Port
    $report.data_root_absent = -not (Test-Path -LiteralPath $DataRoot)
    $probe = New-Object Net.Sockets.TcpClient
    $portOpen = $false
    try {
        $probe.Connect("127.0.0.1", $Port)
        $portOpen = $true
    } catch [System.Net.Sockets.SocketException] {
    } finally {
        $probe.Dispose()
    }
    $report.port_listening = $portOpen
    # `test -e -- <path>` is not usable: GNU test rejects the separator and exits
    # 2 whether or not the path exists, which would make this assertion vacuous.
    & wsl.exe --distribution $Distribution --exec /usr/bin/test -e $WorkspaceLinuxPath
    $workspaceProbe = $LASTEXITCODE
    if ($workspaceProbe -eq 2) { throw "Post-check failed: workspace existence could not be evaluated" }
    $report.workspace_absent = ($workspaceProbe -ne 0)
    $scopedInstances = @($InstanceId | Where-Object { $_ })
    $report.residual_processes = @(Test-ResidualProcesses -DataRoot $DataRoot `
        -Distribution $Distribution -InstanceIds $scopedInstances)
    if ($scopedInstances.Count -eq 0) {
        # Without a recorded instance the check still has to be able to fail, so
        # an unrestricted scan is used and reported as such.
        $report.residue_scope = "unscoped"
    } else {
        $report.residue_scope = "instance"
    }
    $report.worker_view_residue = @(Get-WorkerViewResidue -Distribution $Distribution `
        -InstanceIds $scopedInstances)
    if (-not $report.data_root_absent) { throw "Post-check failed: data root still exists" }
    if (-not $report.workspace_absent) { throw "Post-check failed: WSL workspace still exists" }
    if ($report.port_listening) { throw "Post-check failed: acceptance port is still listening" }
    if ($report.residual_processes.Count -ne 0) { throw "Post-check failed: residual processes remain" }
    if ($report.worker_view_residue.Count -ne 0) { throw "Post-check failed: Worker views/secrets remain" }
    $report.result = "BACKEND_41_E_WINDOWS_POSTCHECK_CLEAN"
    $report | ConvertTo-Json -Compress -Depth 6
    return
}
if (Test-Path -LiteralPath $DataRoot) {
    throw "DataRoot must not exist before this acceptance run: $DataRoot"
}
if (-not (Test-Path -LiteralPath $ManifestPath)) {
    throw "Worker manifest is unavailable to Windows: $ManifestPath"
}
if (-not (Test-Path -LiteralPath $WireSchemaPath -PathType Leaf)) {
    throw "Locked wire schema is unavailable to Windows: $WireSchemaPath"
}
try {
    $wireSchema = Get-Content -LiteralPath $WireSchemaPath -Raw | ConvertFrom-Json
    $wireKeys = @($wireSchema.PSObject.Properties.Name)
    $wireMethods = @($wireKeys | Where-Object { $_ -match '#params$' } |
        ForEach-Object { $_ -replace '#params$', '' })
    if ($wireMethods.Count -ne 28 -or
        @($wireMethods | Where-Object { $wireKeys -notcontains ($_ + '#result') }).Count -ne 0) {
        throw "Locked wire schema must contain 28 method parameter/result pairs"
    }
} catch {
    throw "Locked wire schema validation failed: $($_.Exception.Message)"
}

$workspaceMarker = "$WorkspaceLinuxPath/.agentbox-server-r1-acceptance-e"
& wsl.exe --distribution $Distribution --exec /usr/bin/test -e $WorkspaceLinuxPath
if ($LASTEXITCODE -eq 2) { throw "Workspace existence could not be evaluated before this run" }
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
    "$SourceLinuxPath/tests/server/fixtures/stateful_acp_peer.mjs" `
    "$WorkspaceLinuxPath/stateful_acp_peer.mjs"
if ($LASTEXITCODE -ne 0) { throw "Could not project the stateful native-state fixture" }
& wsl.exe --distribution $Distribution --exec /usr/bin/cp -- `
    "$SourceLinuxPath/pyproject.toml" "$WorkspaceLinuxPath/assets/reference.png"
if ($LASTEXITCODE -ne 0) { throw "Could not project the attachment fixture" }

$env:PYTHONPATH = (Join-Path $SourceRoot "src") + ";" + `
    (Join-Path $SourceRoot "plugins/agent-box-harnesses/src") + ";" + `
    (Join-Path $SourceRoot "plugins/agent-box-runtime-wsl/src") + ";" + `
    (Join-Path $SourceRoot "plugins/agent-box-sandbox-bwrap/src")
$env:AGENT_BOX_WSL_WORKER_MANIFEST = $ManifestPath
$env:AGENT_BOX_WSL_WORKER_LINUX_PATH = $LinuxWorkerPath
$env:AGENT_BOX_WIRE_SCHEMA = $WireSchemaPath

$pluginRoot = Join-Path $SourceRoot "plugins/agent-box-harnesses"
$deploymentPath = Join-Path ([IO.Path]::GetTempPath()) `
    ("agentbox-sidecar-e-" + [guid]::NewGuid().ToString("N") + ".json")
$deployment = [ordered]@{
    schemaVersion = 1
    harnesses = @(
        [ordered]@{
            id = "pi"
            modelControlId = "model"
            # Canonical capability ids only: streaming/approvals/attachments are
            # the drifted aliases the unified contract no longer accepts.
            capabilityClaims = [ordered]@{ stream = $true; permissions = $true; attach = $true }
            controlOptions = [ordered]@{ model = @("fixture-model") }
            adapter = [ordered]@{
                command = "/usr/bin/node"
                args = @("/workspace/fake_acp_peer.mjs")
            }
            timeoutMs = 30000
        },
        # Second explicit no-model Harness for the bounded native-state gate. It
        # declares no model control and no credential, so nothing here can read
        # model configuration or attached credentials. The registry key selects
        # the ACP profile whose session capabilities the adapter negotiates; the
        # executable is the checked-in Node fixture, never a native Harness.
        [ordered]@{
            id = "hermes"
            # The stateful peer advertises sessionCapabilities.resume, and the
            # unified contract requires the static ceiling too: without it the
            # checkpoint is honestly non-resumable and this gate's restart/resume
            # assertion would fail.
            capabilityClaims = [ordered]@{ stream = $true; native_continuation = $true }
            adapter = [ordered]@{
                command = "/usr/bin/node"
                args = @("/workspace/stateful_acp_peer.mjs")
            }
            timeoutMs = 30000
            stateProjection = [ordered]@{ target = "/runtime/home/sessions" }
        },
        # Third explicit no-model Harness: the same controlled ACP peer, told
        # through its adapter environment to answer nothing for eight seconds.
        # It exists to prove that an attempt quiet for longer than the Worker's
        # five second lease still finishes, with no override of the lease.
        [ordered]@{
            id = "omp"
            capabilityClaims = [ordered]@{ stream = $true }
            modelControlId = "model"
            controlOptions = [ordered]@{ model = @("fixture-model") }
            adapter = [ordered]@{
                command = "/usr/bin/node"
                args = @("/workspace/fake_acp_peer.mjs")
                environment = [ordered]@{ AGENTBOX_FIXTURE_SILENCE_MS = "8000" }
            }
            timeoutMs = 30000
        }
    )
}
$statefulHarness = $deployment.harnesses | Where-Object { $_.id -eq "hermes" }
if ($null -eq $statefulHarness -or $statefulHarness.Contains("credentialKind") -or
    $statefulHarness.Contains("credentialEnvironment") -or
    $statefulHarness.Contains("modelControlId") -or
    $statefulHarness.timeoutMs -gt 120000 -or
    $statefulHarness.stateProjection.target -ne "/runtime/home/sessions") {
    throw "The native-state fixture Harness must declare no credential, no model control and a bounded state projection"
}
$leaseSilenceHarness = $deployment.harnesses | Where-Object { $_.id -eq "omp" }
if ($null -eq $leaseSilenceHarness -or
    $leaseSilenceHarness.Contains("credentialKind") -or
    $leaseSilenceHarness.Contains("credentialEnvironment") -or
    $leaseSilenceHarness.adapter.environment.AGENTBOX_FIXTURE_SILENCE_MS -ne "8000" -or
    $leaseSilenceHarness.adapter.environment.Count -ne 1 -or
    $leaseSilenceHarness.Contains("stateProjection")) {
    throw "The lease-silence fixture Harness must declare exactly the silence and nothing else"
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
    # The document names no host path: this machine's plugin root and every mount
    # token are bound here, by whoever starts the Server.
    $arguments = (($PythonPrefix + " -m agent_box.server --data-root $quotedRoot " +
        "--port $Port --sidecar-deployment $quotedDeployment " +
        "--plugin-root `"$pluginRoot`"").Trim())
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
    param([string]$SessionId, [string]$ExecutionId, [string[]]$States,
        [hashtable]$Headers, [int]$Attempts = 600)
    $turn = $null
    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        $session = Invoke-RestMethod -Uri "$baseUrl/api/v1/sessions/$SessionId" -Headers $Headers
        $turn = @($session.turns | Where-Object { $_.id -eq $ExecutionId })[0]
        if ($null -ne $turn -and $States -contains $turn.state) { return $turn }
        Start-Sleep -Milliseconds 50
    }
    # A turn that failed rather than stalled must not be reported as a timeout.
    $observed = if ($null -eq $turn) { "no turn row was created" } `
        else { "observed state=$($turn.state) error_code=$($turn.error_code) capture_state=$($turn.capture_state)" }
    $trail = @($session.events | Where-Object { $_.turn_id -eq $ExecutionId } |
        Select-Object -Last 6 |
        ForEach-Object { "$($_.kind)=$($_.data | ConvertTo-Json -Compress -Depth 4)" })
    throw ("Execution $ExecutionId did not reach $($States -join ',') within $($Attempts * 50)ms: " +
        "$observed; events: $($trail -join ' || ')")
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

function Get-ObjectStorePath {
    param([string]$Digest)
    if ($Digest -notmatch '^sha256:[0-9a-f]{64}$') {
        throw "Server returned a non-identifier object digest: $Digest"
    }
    $hex = $Digest.Substring(7)
    return Join-Path $DataRoot ("objects/sha256/" + $hex.Substring(0, 2) + "/" + $hex)
}

function Read-DataRootObject {
    # Read one immutable object straight out of the Windows DataRoot authority.
    # The content is re-hashed, so an object that was altered after publication
    # is reported instead of being believed.
    param([string]$Digest)
    $path = Get-ObjectStorePath -Digest $Digest
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Object is absent from the Windows ObjectStore: $Digest"
    }
    $bytes = [IO.File]::ReadAllBytes($path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $actual = "sha256:" + ([BitConverter]::ToString($sha.ComputeHash($bytes)) -replace "-", "").ToLowerInvariant() }
    finally { $sha.Dispose() }
    if ($actual -ne $Digest) {
        throw "Object content does not match its immutable digest: $Digest"
    }
    return , $bytes
}

function Assert-R4Checkpoint {
    # Validate the Server-returned native-state checkpoint against the bytes the
    # Windows DataRoot actually holds. The checkpoint is only read here; nothing
    # in this script rewrites it, so a passing gate is evidence about the value
    # the Server produced.
    param([string]$Digest, [string]$NativeId, [string]$HarnessType, [string]$Label)
    $bytes = Read-DataRootObject -Digest $Digest
    $manifest = [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json
    if ($manifest.schema_version -ne 2) { throw "$Label checkpoint schema_version is not 2" }
    if ($manifest.resumable -ne $true) { throw "$Label checkpoint is not resumable" }
    if ($manifest.harnessType -ne $HarnessType) {
        throw "$Label checkpoint harnessType $($manifest.harnessType) crossed Profile scope"
    }
    if ($manifest.nativeSessionId -ne $NativeId) {
        throw "$Label checkpoint does not bind the reported native session id"
    }
    $files = @($manifest.files)
    if ($files.Count -eq 0) { throw "$Label checkpoint carries no native state files" }
    foreach ($file in $files) {
        $names = @($file.PSObject.Properties.Name)
        if (@($names | Where-Object { $_ -notin @("path", "digest", "size") }).Count -ne 0 -or
            $names.Count -ne 3) {
            throw "$Label checkpoint file entry has an unexpected shape"
        }
        if ($file.path -notmatch '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$') {
            throw "$Label checkpoint carries an unsafe state path: $($file.path)"
        }
        if ($file.size -isnot [int] -and $file.size -isnot [long]) {
            throw "$Label checkpoint carries a non-integer state size"
        }
        if ($file.size -le 0 -or $file.size -gt 8388608) {
            throw "$Label checkpoint carries an out-of-bounds state size: $($file.size)"
        }
        $content = Read-DataRootObject -Digest $file.digest
        if ($content.Length -ne $file.size) {
            throw "$Label checkpoint size does not match the stored object: $($file.path)"
        }
    }
    return $manifest
}

function Get-R4StateFile {
    param([object]$Manifest, [string]$Path)
    $entry = @($Manifest.files | Where-Object { $_.path -eq $Path })
    if ($entry.Count -ne 1) { throw "Native state file $Path is missing from the checkpoint" }
    return [Text.Encoding]::UTF8.GetString((Read-DataRootObject -Digest $entry[0].digest))
}

function Get-R4ReopenMethods {
    # Every ACP operation the fixture served, oldest first. The last entry is the
    # one the current round used to open the stored native session.
    param([object]$Manifest)
    $lines = @((Get-R4StateFile -Manifest $Manifest -Path "reopen-method.txt") -split "`n" |
        ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($lines.Count -eq 0) {
        throw "Native state did not record the ACP operation that opened the session"
    }
    return , $lines
}

function Get-DataRootLockOwner {
    # The owning Server holds a byte-range lock on `server.lock`, which Windows
    # enforces against other processes, so the file cannot be read while any
    # Server owns the data root. A successful read is therefore itself the
    # "lock released" evidence, and the content names the instance that held it.
    param([string]$LockPath, [int]$Attempts = 100)
    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        try {
            $owner = (Get-Content -LiteralPath $LockPath -Raw -ErrorAction Stop).Trim()
            if ($owner) { return $owner }
        } catch {
        }
        Start-Sleep -Milliseconds 100
    }
    throw "Data root lock was not released: $LockPath stayed unreadable"
}

function Stop-AgentBoxServer {
    # Bounded stop of the currently running Server. A close request is attempted
    # first; the exit path actually used is returned so the evidence names it.
    param([System.Diagnostics.Process]$Process)
    if ($null -eq $Process -or $Process.HasExited) { return "already_exited" }
    $stem = Join-Path ([IO.Path]::GetTempPath()) `
        ("agentbox-stop-" + [guid]::NewGuid().ToString("N"))
    $logOut = "$stem.out.log"
    $logErr = "$stem.err.log"
    try {
        try {
            Start-Process -FilePath "taskkill.exe" -ArgumentList @("/PID", "$($Process.Id)") `
                -Wait -NoNewWindow -RedirectStandardOutput $logOut -RedirectStandardError $logErr
        } catch {
        }
        if ($Process.WaitForExit(10000)) { return "close_request" }
        # The Server is launched through the py.exe launcher, which owns the
        # python.exe child; a tree termination is what actually ends the Server.
        Start-Process -FilePath "taskkill.exe" `
            -ArgumentList @("/PID", "$($Process.Id)", "/T", "/F") `
            -Wait -NoNewWindow -RedirectStandardOutput $logOut -RedirectStandardError $logErr
        if (-not $Process.WaitForExit(15000)) {
            throw "Server process did not exit during stop"
        }
        return "tree_terminate"
    } finally {
        Remove-Item -LiteralPath $logOut, $logErr -Force -ErrorAction SilentlyContinue
    }
}

$lockPath = Join-Path $DataRoot "server.lock"
$lockAfterFirstStop = ""
$lockAfterFinalStop = ""
$guardResults = $null
$primaryFailure = $null
$acceptanceResult = $null

try {
    $guardResults = Invoke-CleanupGuardChecks -Distribution $Distribution `
        -WorkspaceLinuxPath $WorkspaceLinuxPath
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

    # -----------------------------------------------------------------------
    # Production default lease, eight seconds of silence. The fixture writes
    # nothing until its declared silence has elapsed, nothing overrides the
    # Worker lease, and the elapsed time is asserted so a fixture that answered
    # early could not pass this step. Before this fix the Worker cancelled the
    # attempt at five seconds.
    # -----------------------------------------------------------------------
    $silenceProvider = Invoke-Wire -Method "providerModels.create" -Headers $auth -Params @{
        requestId = "accept-e-silence-provider"
        displayName = "Silent fixture provider"
        harness = "omp"
        provider = "fixture"
        credentialId = $null
        configuration = @()
        models = @(@{
            modelId = "fixture-model"; displayName = "Fixture model"
            availability = "unknown"; unavailableReason = $null
        })
    }
    $silenceProfile = Invoke-Wire -Method "profiles.create" -Headers $auth -Params @{
        requestId = "accept-e-silence-profile"
        displayName = "Windows lease silence fixture"
        harness = "omp"
    }
    $null = Invoke-Wire -Method "profiles.updateConfig" -Headers $auth -Params @{
        requestId = "accept-e-silence-config"
        profileId = $silenceProfile.profile.id
        expectedVersion = $silenceProfile.profile.version
        values = @(@{
            controlId = "model"
            value = @{ providerId = $silenceProvider.providerModel.id; modelId = "fixture-model" }
        })
    }
    $silenceStarted = Get-Date
    $silenceSend = Invoke-Wire -Method "sessions.createAndSend" -Headers $auth -Params @{
        requestId = "accept-e-silence-send"
        workspaceId = $opened.workspace.id
        profileId = $silenceProfile.profile.id
        overrides = @()
        message = @{ text = "silent-success"; attachments = @() }
    }
    $null = Wait-TurnState -SessionId $silenceSend.session.id -ExecutionId $silenceSend.executionId `
        -States @("completed") -Headers $auth
    $silenceElapsedMs = [int]((Get-Date) - $silenceStarted).TotalMilliseconds
    if ($silenceElapsedMs -lt 6000) {
        throw "The quiet attempt did not stay quiet past the lease: ${silenceElapsedMs}ms"
    }
    $silenceSession = Invoke-RestMethod -Uri "$baseUrl/api/v1/sessions/$($silenceSend.session.id)" `
        -Headers $auth
    if ($silenceSession.turns[0].state -ne "completed") {
        throw "A quiet attempt was not completed under the production lease"
    }
    $silenceDelta = @($silenceSession.events | Where-Object { $_.kind -eq "message.delta" })
    if ($silenceDelta.Count -lt 1 -or $silenceDelta[-1].data.text -ne "controlled stream") {
        throw "The quiet attempt produced no streamed answer"
    }
    # `turn.state` also carries transient transitions (accepted/running), so the
    # counterexample is a terminal state other than completed.
    $silenceBadStates = @($silenceSession.events | Where-Object {
            $_.kind -eq "turn.state" -and
            @("failed", "cancelled", "unknown") -contains $_.data.state
        })
    if ($silenceBadStates.Count -ne 0) {
        throw "The quiet attempt recorded a non-completed turn state: $($silenceBadStates[-1].data.state)"
    }

    # -----------------------------------------------------------------------
    # Bounded native-state gate: two rounds on one Session, a real Server
    # restart in between, and the Windows DataRoot as the only durable
    # authority for the native checkpoint.
    # -----------------------------------------------------------------------
    $r4Nonce = "STATEFUL-NONCE-R4-7F3A9C"
    $statefulProfile = Invoke-Wire -Method "profiles.create" -Headers $auth -Params @{
        requestId = "accept-e-r4-profile"
        displayName = "Windows native state fixture"
        harness = "hermes"
    }
    if ($statefulProfile.profile.harness -ne "hermes") {
        throw "Native-state Profile was not created for the fixture Harness"
    }
    $r4First = Invoke-Wire -Method "sessions.createAndSend" -Headers $auth -Params @{
        requestId = "accept-e-r4-first"
        workspaceId = $opened.workspace.id
        profileId = $statefulProfile.profile.id
        overrides = @()
        message = @{ text = "persist-native-state $r4Nonce"; attachments = @() }
    }
    $null = Wait-TurnState -SessionId $r4First.session.id -ExecutionId $r4First.executionId `
        -States @("completed") -Headers $auth

    $r4Before = Invoke-RestMethod -Uri "$baseUrl/api/v1/sessions/$($r4First.session.id)" -Headers $auth
    if ($null -eq $r4Before.checkpoint -or -not $r4Before.checkpoint.object_digest) {
        throw "Server did not return a native-state checkpoint after the first round"
    }
    $roundOneManifest = Assert-R4Checkpoint -Digest $r4Before.checkpoint.object_digest `
        -NativeId $r4Before.checkpoint.native_id -HarnessType "hermes" -Label "first-round"
    # sourceExecutionId binds the checkpoint to the Core execution, which is the
    # identity the Session turn row records for it.
    if ($roundOneManifest.sourceExecutionId -ne $r4Before.turns[0].execution_id) {
        throw "First-round checkpoint is not bound to its own Core execution"
    }
    $nativeSessionId = $roundOneManifest.nativeSessionId
    $roundOneReopen = Get-R4ReopenMethods -Manifest $roundOneManifest
    if ($roundOneReopen[-1] -ne "session/new") {
        throw "First round did not open a fresh native session: $($roundOneReopen -join '/')"
    }
    $roundOneSnapshot = Invoke-Wire -Method "history.snapshot" -Headers $auth `
        -Params @{ sessionId = $r4First.session.id; page = @{ limit = 500 } }
    $roundOneHead = ($roundOneSnapshot.frames | Measure-Object -Property seq -Maximum).Maximum

    # Restart on the same isolated DataRoot: the lock must be released and the
    # authoritative Session/Profile/checkpoint facts must still be readable.
    $stopMode = Stop-AgentBoxServer -Process $process
    $lockAfterFirstStop = Get-DataRootLockOwner -LockPath $lockPath
    $process = Start-AgentBoxServer
    $null = Wait-Liveness -Process $process
    $token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
    $auth = @{ Authorization = "Bearer $token" }
    $helloAfter = Invoke-Wire -Method "server.hello" -Headers $auth -Params @{
        clientVersions = @("wire/1"); clientPresentationSupports = @("wire.eventStream/1")
    }
    if ($helloAfter.serverId -ne $hello.serverId) {
        throw "Restarted Server presented a different stable identity for the same data root"
    }
    $recovered = Invoke-Wire -Method "sessions.list" -Headers $auth -Params @{
        workspaceId = $opened.workspace.id; includeArchived = $false
    }
    if (@($recovered.items | Where-Object { $_.id -eq $r4First.session.id }).Count -ne 1) {
        throw "Restarted Server lost the authoritative Session catalog"
    }

    $r4Second = Invoke-Wire -Method "sessions.send" -Headers $auth -Params @{
        requestId = "accept-e-r4-second"
        sessionId = $r4First.session.id
        overrides = @()
        message = @{ text = "recall-native-state"; attachments = @() }
    }
    $null = Wait-TurnState -SessionId $r4First.session.id -ExecutionId $r4Second.executionId `
        -States @("completed") -Headers $auth

    $r4After = Invoke-RestMethod -Uri "$baseUrl/api/v1/sessions/$($r4First.session.id)" -Headers $auth
    if ($r4After.checkpoint.native_id -ne $nativeSessionId) {
        throw "Second round did not keep the first-round native session identity"
    }
    $roundTwoManifest = Assert-R4Checkpoint -Digest $r4After.checkpoint.object_digest `
        -NativeId $nativeSessionId -HarnessType "hermes" -Label "second-round"
    if ($roundTwoManifest.nativeSessionId -ne $nativeSessionId) {
        throw "Second-round checkpoint created a different native session"
    }
    $roundTwoReopen = Get-R4ReopenMethods -Manifest $roundTwoManifest
    if ($roundTwoReopen[-1] -ne "session/resume") {
        throw "Second round did not reopen the stored native session through session/resume: $($roundTwoReopen -join '/')"
    }
    $roundTwoSnapshot = Invoke-Wire -Method "history.snapshot" -Headers $auth `
        -Params @{ sessionId = $r4First.session.id; page = @{ limit = 500 } }
    $roundTwoFrames = @($roundTwoSnapshot.frames | Where-Object { $_.seq -gt $roundOneHead })
    $roundTwoDelta = @($roundTwoFrames | Where-Object {
        $_.event.kind -eq "message.delta" -and $_.event.text -eq $r4Nonce
    })
    if ($roundTwoDelta.Count -eq 0) {
        throw "Second round did not return the first-round nonce from native state"
    }
    $roundTwoTerminal = @($roundTwoFrames | Where-Object {
        $_.event.kind -eq "execution.state" -and `
        $_.event.executionId -eq $r4Second.executionId -and $_.event.state -eq "completed"
    })
    if ($roundTwoTerminal.Count -ne 1) { throw "Second round has no single completed state frame" }
    if ($roundTwoDelta[0].seq -ge $roundTwoTerminal[0].seq) {
        throw "Second-round delta was not persisted before the completed state"
    }

    $acceptanceResult = [pscustomobject]@{
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
        lease_silence = [ordered]@{
            fixture = "plugins/agent-box-harnesses/tests/harness_remote/fake_acp_peer.mjs"
            harness = "omp"
            declared_silence_ms = 8000
            lease_ms = 5000
            lease_override = $false
            elapsed_ms = $silenceElapsedMs
            session_id = $silenceSend.session.id
            execution = $silenceSend.executionId
            turn_state = $silenceSession.turns[0].state
            delta_seq = $silenceDelta[0].seq
            delta_text = $silenceDelta[-1].data.text
        }
        r4 = [ordered]@{
            fixture = "tests/server/fixtures/stateful_acp_peer.mjs"
            harness = "hermes"
            state_projection = "/runtime/home/sessions"
            timeout_ms = 30000
            nonce = $r4Nonce
            session_id = $r4First.session.id
            first_execution = $r4First.executionId
            second_execution = $r4Second.executionId
            checkpoint_digest = $r4After.checkpoint.object_digest
            checkpoint_native_id = $nativeSessionId
            checkpoint_files = @($roundTwoManifest.files | ForEach-Object { $_.path })
            first_round_reopen = $roundOneReopen
            second_round_reopen = $roundTwoReopen
            delta_seq = $roundTwoDelta[0].seq
            completed_seq = $roundTwoTerminal[0].seq
            stop_mode = $stopMode
            lock_instance_after_first_stop = $lockAfterFirstStop
            lock_instance_after_final_stop = $null
            server_id_after_restart = $helloAfter.serverId
            cleanup_guards = $guardResults
        }
    }
} catch {
    $primaryFailure = $_
} finally {
    # Cleanup problems are collected instead of thrown from the cleanup path, so a
    # failed cleanup can never replace the failure that actually stopped the run.
    $cleanupProblems = @()
    if ($null -ne $socket) { $socket.Dispose() }
    if ($null -ne $process -and -not $process.HasExited) {
        try {
            $null = Stop-AgentBoxServer -Process $process
        } catch {
            $cleanupProblems += "Server stop failed: $($_.Exception.Message)"
        }
    }
    if (Test-Path -LiteralPath $lockPath) {
        try {
            $lockAfterFinalStop = Get-DataRootLockOwner -LockPath $lockPath
            if ($null -ne $acceptanceResult) {
                $acceptanceResult.r4.lock_instance_after_final_stop = $lockAfterFinalStop
            }
            if ($lockAfterFirstStop -and $lockAfterFinalStop -eq $lockAfterFirstStop) {
                $cleanupProblems += "Data root lock was not re-acquired by the restarted Server"
            }
        } catch {
            $cleanupProblems += "Data root lock check failed: $($_.Exception.Message)"
        }
    } elseif ($Cleanup) {
        $cleanupProblems += "Data root lock file disappeared before cleanup verification"
    }
    if ($null -ne $primaryFailure -or $cleanupProblems.Count -ne 0) {
        # A failed run keeps the Server output so the cause is inspectable.
        Write-Host "Server stdout retained: $stdoutPath"
        Write-Host "Server stderr retained: $stderrPath"
    } else {
        Remove-Item -LiteralPath $stdoutPath, $stderrPath, $deploymentPath `
            -Force -ErrorAction SilentlyContinue
    }
    if ($Cleanup -and (Test-Path -LiteralPath $DataRoot)) {
        try {
            Assert-OwnerMarkedDataRoot -Path $DataRoot
            Remove-Item -LiteralPath $DataRoot -Recurse -Force
            if (Test-Path -LiteralPath $DataRoot) { $cleanupProblems += "Data cleanup left residual data" }
        } catch {
            $cleanupProblems += "Data cleanup refused or failed: $($_.Exception.Message)"
        }
    }
    if ($Cleanup) {
        try {
            Assert-MarkedWorkspace -Distribution $Distribution -MarkerPath $workspaceMarker
            & wsl.exe --distribution $Distribution --exec /usr/bin/rm -r -- $WorkspaceLinuxPath
            if ($LASTEXITCODE -ne 0) { $cleanupProblems += "Workspace cleanup failed" }
            # `test -e -- <path>` exits 2 for any input, so the residue assertion has
            # to read the exit code and treat "could not evaluate" as a failure too.
            & wsl.exe --distribution $Distribution --exec /usr/bin/test -e $WorkspaceLinuxPath
            $workspaceProbe = $LASTEXITCODE
            if ($workspaceProbe -eq 2) {
                $cleanupProblems += "Workspace existence could not be evaluated after cleanup"
            } elseif ($workspaceProbe -eq 0) {
                $cleanupProblems += "Workspace cleanup left residual data"
            }
        } catch {
            $cleanupProblems += "Workspace cleanup refused or failed: $($_.Exception.Message)"
        }
        $portReachable = $false
        try {
            $probe = New-Object Net.Sockets.TcpClient
            $probe.Connect("127.0.0.1", $Port)
            $probe.Dispose()
            $portReachable = $true
        } catch [System.Net.Sockets.SocketException] { }
        if ($portReachable) { $cleanupProblems += "Server port remains reachable after cleanup: $Port" }
        $scopedInstances = @(@($lockAfterFirstStop, $lockAfterFinalStop) | Where-Object { $_ })
        $residual = @(Test-ResidualProcesses -DataRoot $DataRoot -Distribution $Distribution `
            -InstanceIds $scopedInstances)
        if ($residual.Count -ne 0) {
            $cleanupProblems += "Residual Server/Worker/sidecar processes remain: $($residual -join '; ')"
        }
        $residue = @(Get-WorkerViewResidue -Distribution $Distribution `
            -InstanceIds $scopedInstances)
        if ($residue.Count -ne 0) {
            $cleanupProblems += "Worker views/secrets remain after cleanup: $($residue -join '; ')"
        }
    }
    if ($cleanupProblems.Count -ne 0 -and $null -ne $primaryFailure) {
        throw ("Acceptance failed: $($primaryFailure.Exception.Message); " +
            "cleanup verification also failed: $($cleanupProblems -join ' | ')")
    }
    if ($cleanupProblems.Count -ne 0) {
        throw "Cleanup verification failed: $($cleanupProblems -join ' | ')"
    }
}
if ($null -ne $primaryFailure) { throw $primaryFailure }
# Printed only once every gate, including the cleanup verification above, has held.
$acceptanceResult | ConvertTo-Json -Compress -Depth 6
