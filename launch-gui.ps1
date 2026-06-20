# ============================================================
#  agent-box GUI launcher (Windows PowerShell)
# ============================================================
#  Usage:  .\launch-gui.ps1
#  - Activates the local .venv
#  - Prefers gui-redesign.py; falls back to gui-windows.py
#  - Uses pythonw.exe (no console window)
# ============================================================

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPy    = Join-Path $ScriptDir '.venv\Scripts\pythonw.exe'
$VenvPyC   = Join-Path $ScriptDir '.venv\Scripts\python.exe'
$GuiNew    = Join-Path $ScriptDir 'gui-redesign.py'
$GuiOld    = Join-Path $ScriptDir 'gui-windows.py'

function Launch([string]$python, [string]$gui) {
    if (Test-Path $python -PathType Leaf -and Test-Path $gui -PathType Leaf) {
        $proc = Start-Process -FilePath $python -ArgumentList "`"$gui`"" -PassThru
        Write-Host "Launched agent-box GUI (pid $($proc.Id))"
        exit 0
    }
}

# Try combinations in preference order
Launch $VenvPy  $GuiNew
Launch $VenvPyC $GuiNew
Launch $VenvPy  $GuiOld
Launch $VenvPyC $GuiOld

# If we get here, nothing worked
Write-Host ""
Write-Host "agent-box GUI launcher: could not find Python or GUI script." -ForegroundColor Red
Write-Host ""
Write-Host "Checked:"
Write-Host "  $VenvPy"
Write-Host "  $VenvPyC"
Write-Host "  $GuiNew"
Write-Host "  $GuiOld"
Write-Host ""
Write-Host "Make sure the project's venv is set up (.venv\Scripts\ exists)"
Write-Host "and that gui-redesign.py or gui-windows.py is in the project root."
Read-Host "Press Enter to close"
exit 1
