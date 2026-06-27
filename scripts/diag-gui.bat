@echo off
REM ============================================================
REM  agent-box GUI Diagnostic Launcher
REM  Run from cmd.exe in the project root
REM ============================================================

setlocal

set "LOG=%~dp0..\logs\diag-output.log"
echo === agent-box diagnostic run %DATE% %TIME% > "%LOG%"

REM --- Step 1: WSL pre-warm -----------------------------------------
echo.>> "%LOG%"
echo === Step 1: WSL pre-warm ===>> "%LOG%"
echo === Step 1: WSL pre-warm ===
wsl.exe -d Ubuntu -e echo WSL_warm >> "%LOG%" 2>&1
if errorlevel 1 (
  echo   FAIL (exit %errorlevel%)>> "%LOG%"
  echo   FAIL
  goto done
)
echo   OK>> "%LOG%"
echo   OK

REM --- Step 2: pushd to project -------------------------------------
echo.>> "%LOG%"
echo === Step 2: pushd to project ===>> "%LOG%"
echo === Step 2: pushd to project ===
pushd "%~dp0.." >> "%LOG%" 2>&1
if errorlevel 1 (
  echo   FAIL -- pushd failed>> "%LOG%"
  echo   FAIL
  goto done
)
echo   CWD is now: %CD%>> "%LOG%"
echo   CWD is now: %CD%

REM --- Step 3: pythonw.exe on PATH ----------------------------------
echo.>> "%LOG%"
echo === Step 3: pythonw.exe on PATH ===>> "%LOG%"
echo === Step 3: pythonw.exe on PATH ===
where pythonw.exe >> "%LOG%" 2>&1
if errorlevel 1 (
  echo   FAIL -- install Python and check 'Add to PATH'>> "%LOG%"
  echo   FAIL
  goto cleanup
)
echo   OK>> "%LOG%"
echo   OK

REM --- Step 4: PyWebView import test ---------------------------------
echo.>> "%LOG%"
echo === Step 4: PyWebView + webview import test ===>> "%LOG%"
echo === Step 4: PyWebView + webview import test ===
pythonw.exe -c "import webview, sys; print('webview ok, python', sys.executable)" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo   FAIL -- install with: pythonw.exe -m pip install pywebview>> "%LOG%"
  echo   FAIL
  goto cleanup
)
echo   OK>> "%LOG%"
echo   OK

REM --- Step 5: gui-web/bridge.py present ------------------------------
echo.>> "%LOG%"
echo === Step 5: gui-web/bridge.py present ===>> "%LOG%"
echo === Step 5: gui-web/bridge.py present ===
if not exist gui-web\bridge.py (
  echo   FAIL -- gui-web\bridge.py missing>> "%LOG%"
  echo   FAIL
  goto cleanup
)
echo   OK -- %CD%\gui-web\bridge.py>> "%LOG%"
echo   OK

REM --- Step 6: gui-web/dist/ built -----------------------------------
echo.>> "%LOG%"
echo === Step 6: gui-web/dist/ present ===>> "%LOG%"
echo === Step 6: gui-web/dist/ present ===
if not exist gui-web\dist\index.html (
  echo   FAIL -- frontend not built. Run: cd gui-web ^&^& npm run build>> "%LOG%"
  echo   FAIL
  goto cleanup
)
echo   OK -- %CD%\gui-web\dist\>> "%LOG%"
echo   OK

REM --- Step 7: Run bridge.py with python.exe (console) ----------------
echo.>> "%LOG%"
echo === Step 7: run bridge.py with python.exe ===>> "%LOG%"
echo   This SHOULD pop the GUI window.>> "%LOG%"
echo.>> "%LOG%"
echo   --- python.exe gui-web/bridge.py --prod output --- >> "%LOG%"
echo === Step 7: run bridge.py (python.exe, console) ===
echo   Window may pop now. If not, see log.
echo.
python.exe gui-web\bridge.py --prod >> "%LOG%" 2>&1
echo.>> "%LOG%"
echo   --- python.exe exited with code %errorlevel% --- >> "%LOG%"
echo   python.exe exited with code %errorlevel% (see log for full output)

REM --- cleanup ------------------------------------------------------
:cleanup
popd >> "%LOG%" 2>&1

:done
echo.>> "%LOG%"
echo === Diagnostic done. Log: %LOG% >> "%LOG%"
echo === Diagnostic done ===
echo   Log saved to: %LOG%
echo   Open with:  notepad "%LOG%"
pause
endlocal
