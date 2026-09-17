param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string]$DataRoot,
    [int]$Port = 18732,
    [string]$PythonExe = "py.exe",
    [string]$PythonPrefix = "-3.12",
    # Since the deployment-composed registry (orders 44-46) the plain runtime
    # registers no Harness at all, so stage A needs the same document the
    # product runs: a non-secret deployment plus its machine-local bindings.
    [Parameter(Mandatory = $true)][string]$DeploymentPath,
    [Parameter(Mandatory = $true)][string]$PluginRoot,
    [string[]]$Mount = @(),
    [switch]$Cleanup
)

$ErrorActionPreference = "Stop"
if (Test-Path -LiteralPath $DataRoot) {
    throw "DataRoot must not exist before this acceptance run: $DataRoot"
}

$env:PYTHONPATH = (Join-Path $SourceRoot "src") + ";" + `
    (Join-Path $SourceRoot "plugins/agent-box-harnesses/src") + ";" + `
    (Join-Path $SourceRoot "plugins/agent-box-runtime-wsl/src") + ";" + `
    (Join-Path $SourceRoot "plugins/agent-box-sandbox-bwrap/src")
$baseUrl = "http://127.0.0.1:$Port"
$logStem = Join-Path ([IO.Path]::GetTempPath()) ("agentbox-server-a-" + [guid]::NewGuid().ToString("N"))
$stdoutPath = $logStem + ".stdout.log"
$stderrPath = $logStem + ".stderr.log"
$process = $null

function Start-AgentBoxServer {
    $quotedRoot = '"' + $DataRoot + '"'
    $quotedDeployment = '"' + $DeploymentPath + '"'
    $quotedPluginRoot = '"' + $PluginRoot + '"'
    $mountArguments = ""
    foreach ($binding in $Mount) {
        $mountArguments = ($mountArguments + " --mount `"" + $binding + "`"").Trim()
    }
    $arguments = (($PythonPrefix + " -m agent_box.server --data-root $quotedRoot --port $Port " + `
        "--sidecar-deployment $quotedDeployment --plugin-root $quotedPluginRoot $mountArguments").Trim())
    return Start-Process -FilePath $PythonExe -ArgumentList $arguments -PassThru `
        -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
}

function Wait-Readiness {
    param([System.Diagnostics.Process]$Process)
    for ($attempt = 0; $attempt -lt 80; $attempt++) {
        if ($Process.HasExited) {
            throw "Server exited before readiness; inspect $stderrPath"
        }
        try {
            return Invoke-RestMethod -Uri "$baseUrl/live" -TimeoutSec 1
        } catch {
            Start-Sleep -Milliseconds 100
        }
    }
    throw "Server did not become ready; inspect $stderrPath"
}

try {
    $process = Start-AgentBoxServer
    $live = Wait-Readiness -Process $process
    if ($live.status -ne "alive") { throw "Unexpected liveness response" }

    try {
        Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/api/v1/readiness" | Out-Null
        throw "Unauthenticated readiness unexpectedly succeeded"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw }
    }

    $tokenPath = Join-Path $DataRoot "secrets/http-token"
    $tokenAcl = Get-Acl -LiteralPath $tokenPath
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $tokenRules = $tokenAcl.GetAccessRules(
        $true, $true, [Security.Principal.SecurityIdentifier]
    )
    if (-not $tokenAcl.AreAccessRulesProtected -or
        @($tokenRules | Where-Object { $_.IdentityReference.Value -ne $currentSid }).Count -ne 0) {
        throw "HTTP token ACL is not restricted to the current Windows identity"
    }
    $token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
    $headers = @{ Authorization = "Bearer $token" }
    $ready = Invoke-RestMethod -Uri "$baseUrl/api/v1/readiness" -Headers $headers
    if ($ready.storage -ne "ready") { throw "Storage is not ready" }
    $profileHeaders = @{
        Authorization = "Bearer $token"
        "Idempotency-Key" = "accept-a-profile"
    }
    $profileBody = @{
        name = "Windows A acceptance"
        harness_type = "codex"
        configuration = @{ model = "authorization-required-before-use" }
    } | ConvertTo-Json -Depth 4 -Compress
    $profile = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/v1/profiles" `
        -Headers $profileHeaders -ContentType "application/json" -Body $profileBody
    $sha256 = [Security.Cryptography.SHA256]::Create()
    $firstTokenDigest = [BitConverter]::ToString(
        $sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($token))
    )

    Stop-Process -Id $process.Id
    $process.WaitForExit()
    $process = Start-AgentBoxServer
    $live = Wait-Readiness -Process $process
    $secondToken = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
    $secondTokenDigest = [BitConverter]::ToString(
        $sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($secondToken))
    )
    if ($firstTokenDigest -ne $secondTokenDigest) { throw "Bootstrap token changed across restart" }
    $headers = @{ Authorization = "Bearer $secondToken" }
    $ready = Invoke-RestMethod -Uri "$baseUrl/api/v1/readiness" -Headers $headers
    $profiles = Invoke-RestMethod -Uri "$baseUrl/api/v1/profiles" -Headers $headers
    if ($profiles.items.Count -ne 1 -or $profiles.items[0].profile_id -ne $profile.profile_id) {
        throw "Profile record did not survive restart"
    }

    [pscustomobject]@{
        result = "SERVER_HTTP_R1_A_WINDOWS_OK"
        status = $ready.service
        storage = $ready.storage
        api_version = $ready.api_version
        persisted_profiles = $profiles.items.Count
        token_path = $tokenPath
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
            throw "Cleanup refused: owner marker mismatch"
        }
    }
}
