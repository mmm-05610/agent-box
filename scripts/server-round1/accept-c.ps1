param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][string]$TokenPath,
    [Parameter(Mandatory = $true)][string]$Distribution,
    [Parameter(Mandatory = $true)][string]$WorkspaceLinuxPath,
    [Parameter(Mandatory = $true)][string]$CredentialId,
    [Parameter(Mandatory = $true)][string]$Model,
    [Parameter(Mandatory = $true)][int]$ServerPid,
    [Parameter(Mandatory = $true)][string]$ReceiptPath
)

$ErrorActionPreference = "Stop"
$token = (Get-Content -LiteralPath $TokenPath -Raw).Trim()
$headers = @{ Authorization = "Bearer $token" }
$runKey = [guid]::NewGuid().ToString("N")
if ($ServerPid -le 0 -or $null -eq (Get-Process -Id $ServerPid -ErrorAction SilentlyContinue)) {
    throw "Server process identity is unavailable"
}

function Invoke-JsonPost {
    param([string]$Path, [string]$Key, [hashtable]$Body)
    return Invoke-RestMethod -Method Post -Uri ($BaseUrl + $Path) `
        -Headers @{ Authorization = "Bearer $token"; "Idempotency-Key" = $Key } `
        -ContentType "application/json; charset=utf-8" `
        -Body ($Body | ConvertTo-Json -Depth 8 -Compress)
}

function Wait-TurnEvents {
    param([string]$SessionId, [string]$TurnId, [int]$After)
    Add-Type -AssemblyName System.Net.Http
    $client = [Net.Http.HttpClient]::new()
    $client.DefaultRequestHeaders.Authorization = `
        [Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $token)
    $url = "$BaseUrl/api/v1/sessions/$SessionId/events?after=$After"
    $response = $client.GetAsync(
        $url, [Net.Http.HttpCompletionOption]::ResponseHeadersRead
    ).GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) { throw "SSE returned $($response.StatusCode)" }
    $reader = [IO.StreamReader]::new(
        $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult(),
        [Text.Encoding]::UTF8
    )
    $cursor = $After
    $messages = @()
    $state = $null
    $deadline = [DateTime]::UtcNow.AddSeconds(130)
    $pending = $reader.ReadLineAsync()
    try {
        while ([DateTime]::UtcNow -lt $deadline) {
            if (-not $pending.Wait(1000)) { continue }
            $line = $pending.Result
            if ($null -eq $line) { throw "SSE stream closed before terminal Turn state" }
            $pending = $reader.ReadLineAsync()
            if (-not $line.StartsWith("data: ")) { continue }
            $eventValue = $line.Substring(6) | ConvertFrom-Json
            if ([int]$eventValue.seq -le $cursor) { throw "SSE sequence did not advance" }
            $cursor = [int]$eventValue.seq
            if ($eventValue.turn_id -ne $TurnId) { continue }
            if ($eventValue.kind -eq "message.delta") {
                $messages += [string]$eventValue.data.text
            }
            if ($eventValue.kind -eq "turn.state" -and
                $eventValue.data.state -in @("completed", "failed", "cancelled", "unknown")) {
                $state = [string]$eventValue.data.state
                break
            }
        }
    } finally {
        $reader.Dispose()
        $response.Dispose()
        $client.Dispose()
    }
    if ($null -eq $state) { throw "Turn did not reach a terminal state within 130 seconds" }
    return [pscustomobject]@{ cursor = $cursor; messages = $messages; state = $state }
}

$ready = Invoke-RestMethod -Uri "$BaseUrl/api/v1/readiness" -Headers $headers
if (-not $ready.capabilities.codex) { throw "Codex execution capability is unavailable" }
$probe = Invoke-JsonPost -Path "/api/v1/connections/probe" -Key ("accept-c-" + $runKey + "-probe") `
    -Body @{ kind = "wsl"; distribution = $Distribution }
$workspace = Invoke-JsonPost -Path "/api/v1/workspaces" -Key ("accept-c-" + $runKey + "-workspace") `
    -Body @{ probe_id = $probe.probe_id; path = $WorkspaceLinuxPath }
$profile = Invoke-JsonPost -Path "/api/v1/profiles" -Key ("accept-c-" + $runKey + "-profile") -Body @{
    name = "Codex C acceptance"
    harness_type = "codex"
    configuration = @{ model = $Model; provider = "deepseek"; reasoning_effort = "high" }
    credential_id = $CredentialId
}
$session = Invoke-JsonPost -Path "/api/v1/sessions" -Key ("accept-c-" + $runKey + "-session") -Body @{
    workspace_id = $workspace.workspace_id
    profile_id = $profile.profile_id
}

$nonce = "ABR1-" + [guid]::NewGuid().ToString("N")
$turnOne = Invoke-JsonPost -Path "/api/v1/sessions/$($session.session_id)/turns" `
    -Key ("accept-c-" + $runKey + "-turn-1") -Body @{
        text = "Remember this exact one-time test nonce for my next turn: $nonce. Reply briefly."
        expected_profile_revision = 1
    }
$firstEvents = Wait-TurnEvents -SessionId $session.session_id -TurnId $turnOne.turn_id -After 0
if ($firstEvents.state -ne "completed") { throw "First Codex Turn ended as $($firstEvents.state)" }
$afterFirst = Invoke-RestMethod -Uri "$BaseUrl/api/v1/sessions/$($session.session_id)" -Headers $headers
$firstNativeId = [string]$afterFirst.checkpoint.native_id
if ([string]::IsNullOrWhiteSpace($firstNativeId)) { throw "First Turn has no native checkpoint identity" }

$turnTwo = Invoke-JsonPost -Path "/api/v1/sessions/$($session.session_id)/turns" `
    -Key ("accept-c-" + $runKey + "-turn-2") -Body @{
        text = "What exact one-time test nonce did I ask you to remember? Reply with only that nonce."
        expected_profile_revision = 1
    }
$secondEvents = Wait-TurnEvents -SessionId $session.session_id -TurnId $turnTwo.turn_id `
    -After $firstEvents.cursor
if ($secondEvents.state -ne "completed") { throw "Second Codex Turn ended as $($secondEvents.state)" }
if (([string]::Join("`n", $secondEvents.messages)) -notmatch [regex]::Escape($nonce)) {
    throw "Second Turn did not recall the nonce"
}
$afterSecond = Invoke-RestMethod -Uri "$BaseUrl/api/v1/sessions/$($session.session_id)" -Headers $headers
if ($afterSecond.checkpoint.native_id -ne $firstNativeId) {
    throw "Native Codex identity changed between Turn 1 and Turn 2"
}

$receipt = [ordered]@{
    schema_version = 1
    result = "SERVER_CODEX_R1_C_WINDOWS_OK"
    session_id = $session.session_id
    profile_id = $profile.profile_id
    workspace_id = $workspace.workspace_id
    event_cursor = $secondEvents.cursor
    native_id = $firstNativeId
    nonce = $nonce
    model = $Model
    real_model_requests = 2
    server_pid = $ServerPid
}
$receipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8
$receipt | ConvertTo-Json -Compress
