@echo off
REM ============================================================
REM  agent-box GUI launcher (Windows)
REM ============================================================
REM  Double-click to launch the redesigned GUI.
REM  - Activates the local .venv (no system Python needed)
REM  - Uses pythonw.exe to avoid a console window flash
REM  - Falls back to gui-windows.py if the redesign isn't built yet
REM ============================================================

setlocal

REM Resolve project root (this script's directory)
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

set "VENV_PY=%SCRIPT_DIR%\.venv\Scripts\pythonw.exe"
set "VENV_PY_CONSOLE=%SCRIPT_DIR%\.venv\Scripts\python.exe"
set "GUI_NEW=%SCRIPT_DIR%\gui-redesign.py"
set "GUI_OLD=%SCRIPT_DIR%\gui-windows.py"

REM Prefer the redesign GUI; fall back to the old one
if exist "%VENV_PY%" if exist "%GUI_NEW%" (
    start "" "%VENV_PY%" "%GUI_NEW%"
    exit /b 0
)

if exist "%VENV_PY_CONSOLE%" if exist "%GUI_NEW%" (
    "%VENV_PY_CONSOLE%" "%GUI_NEW%"
    exit /b 0
)

if exist "%VENV_PY%" if exist "%GUI_OLD%" (
    start "" "%VENV_PY%" "%GUI_OLD%"
    exit /b 0
)

if exist "%VENV_PY_CONSOLE%" if exist "%GUI_OLD%" (
    "%VENV_PY_CONSOLE%" "%GUI_OLD%"
    exit /b 0
)

REM ---- error path ----
echo.
echo  agent-box GUI launcher
echo  =======================
echo.
echo  Could not launch the GUI. Checked:
echo    %VENV_PY%
echo    %VENV_PY_CONSOLE%
echo    %GUI_NEW%
echo    %GUI_OLD%
echo.
echo  Make sure you ran the project setup (pip install) and
echo  that one of the GUI files exists.
echo.
pause
endlocal
