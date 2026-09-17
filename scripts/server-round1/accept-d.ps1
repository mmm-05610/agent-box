param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][string]$TokenPath,
    [Parameter(Mandatory = $true)][string]$ReceiptPath
)

$ErrorActionPreference = "Stop"
$token = (Get-Content -LiteralPath $TokenPath -Raw).Trim()
$receipt = Get-Content -LiteralPath $ReceiptPath -Raw | ConvertFrom-Json
if ($receipt.schema_version -ne 1 -or $receipt.result -ne "SERVER_CODEX_R1_C_WINDOWS_OK") {
    throw "Stage C receipt is invalid"
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
    $response = $client.GetAsync(
        "$BaseUrl/api/v1/sessions/$SessionId/events?after=$After",
        [Net.Http.HttpCompletionOption]::ResponseHeadersRead
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
            $cursor = [int]$eventValue.seq
            if ($eventValue.turn_id -ne $TurnId) { continue }
            if ($eventValue.kind -eq "message.delta") { $messages += [string]$eventValue.data.text }
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

$headers = @{ Authorization = "Bearer $token" }
$before = Invoke-RestMethod -Uri "$BaseUrl/api/v1/sessions/$($receipt.session_id)" -Headers $headers
if ($before.checkpoint.native_id -ne $receipt.native_id) {
    throw "Restarted Server did not retain the Stage C checkpoint"
}
$turn = Invoke-JsonPost -Path "/api/v1/sessions/$($receipt.session_id)/turns" `
    -Key "accept-d-turn-3" -Body @{
        text = "After the service restart, what exact one-time test nonce did I ask you to remember? Reply with only it."
        expected_profile_revision = 1
    }
$events = Wait-TurnEvents -SessionId $receipt.session_id -TurnId $turn.turn_id `
    -After ([int]$receipt.event_cursor)
if ($events.state -ne "completed") { throw "Cold-resume Turn ended as $($events.state)" }
if (([string]::Join("", $events.messages)) -notmatch [regex]::Escape($receipt.nonce)) {
    throw "Cold-resume Turn did not recall the Stage C nonce"
}
$after = Invoke-RestMethod -Uri "$BaseUrl/api/v1/sessions/$($receipt.session_id)" -Headers $headers
if ($after.checkpoint.native_id -ne $receipt.native_id) {
    throw "Native Codex identity changed after cold resume"
}

[pscustomobject]@{
    result = "SERVER_CODEX_R1_D_WINDOWS_OK"
    session_id = $receipt.session_id
    native_id = $receipt.native_id
    event_cursor = $events.cursor
    stage_c_model_requests = [int]$receipt.real_model_requests
    stage_d_model_requests = 1
    total_real_model_requests = ([int]$receipt.real_model_requests + 1)
} | ConvertTo-Json -Compress
