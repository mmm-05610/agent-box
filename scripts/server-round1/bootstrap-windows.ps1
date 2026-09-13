param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string]$EnvironmentRoot
)

$ErrorActionPreference = "Stop"
if ($EnvironmentRoot.StartsWith("\\")) {
    throw "EnvironmentRoot must be on a local Windows filesystem"
}
if (Test-Path -LiteralPath $EnvironmentRoot) {
    throw "EnvironmentRoot must not exist: $EnvironmentRoot"
}

py.exe -3.12 -m venv $EnvironmentRoot
$pythonExe = Join-Path $EnvironmentRoot "Scripts/python.exe"
& $pythonExe -m pip install --disable-pip-version-check --quiet `
    -r (Join-Path $SourceRoot "lockfiles/server-windows-py312.txt")
if ($LASTEXITCODE -ne 0) { throw "Pinned Server dependency installation failed" }

[pscustomobject]@{
    result = "SERVER_HTTP_R1_WINDOWS_ENV_READY"
    python = $pythonExe
    lockfile = (Join-Path $SourceRoot "lockfiles/server-windows-py312.txt")
} | ConvertTo-Json -Compress
