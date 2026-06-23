@echo off
REM ============================================================
REM  Diagnostic launcher -- verbose, logs to diag-output.log
REM  Run from cmd.exe:   \\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box\diag-gui.bat
REM ============================================================

setlocal

set "LOG=%~dp0logs\diag-output.log"
echo === agent-box diagnostic run %DATE% %TIME% > "%LOG%"

REM --- Step 1: WSL pre-warm -----------------------------------------
echo.>> "%LOG%"
echo === Step 1: WSL pre-warm ===>> "%LOG%"
echo.
echo === Step 1: WSL pre-warm ===
wsl.exe -d Ubuntu -e echo WSL_warm >> "%LOG%" 2>&1
if errorlevel 1 goto fail1
echo   OK>> "%LOG%"
echo   OK
goto step2

:fail1
echo   FAIL (exit %errorlevel%)>> "%LOG%"
echo   FAIL
goto done

REM --- Step 2: UNC path accessible ----------------------------------
:step2
echo.>> "%LOG%"
echo === Step 2: UNC path accessible ===>> "%LOG%"
echo.
echo === Step 2: UNC path accessible ===
dir "\\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box" >> "%LOG%" 2>&1
if errorlevel 1 goto fail2
echo   OK>> "%LOG%"
echo   OK
goto step3

:fail2
echo   FAIL -- open File Explorer at \\wsl.localhost\Ubuntu\ first>> "%LOG%"
echo   FAIL -- try opening \\wsl.localhost\Ubuntu\ in File Explorer first
goto done

REM --- Step 3: pushd to project -------------------------------------
:step3
echo.>> "%LOG%"
echo === Step 3: pushd to project ===>> "%LOG%"
echo.
echo === Step 3: pushd to project ===
pushd "\\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box" >> "%LOG%" 2>&1
if errorlevel 1 goto fail3
echo   CWD is now %CD%>> "%LOG%"
echo   CWD is now: %CD%
goto step4

:fail3
echo   FAIL -- pushd failed>> "%LOG%"
echo   FAIL -- pushd failed
goto done

REM --- Step 4: which pythonw.exe ------------------------------------
:step4
echo.>> "%LOG%"
echo === Step 4: pythonw.exe on PATH ===>> "%LOG%"
echo.
echo === Step 4: pythonw.exe on PATH ===
where pythonw.exe >> "%LOG%" 2>&1
if errorlevel 1 goto fail4
echo   OK>> "%LOG%"
echo   OK
goto step5

:fail4
echo   FAIL -- install Python from python.org and check 'Add to PATH'>> "%LOG%"
echo   FAIL
goto cleanup

REM --- Step 5: customtkinter import test ---------------------------
:step5
echo.>> "%LOG%"
echo === Step 5: customtkinter import test ===>> "%LOG%"
echo.
echo === Step 5: customtkinter import test ===
REM Use pythonw (windowless) to mimic the real launch, but capture
REM stderr so any error is visible in the log.
pythonw.exe -c "import customtkinter, sys; print('ctk', customtkinter.__version__, 'on', sys.executable)" >> "%LOG%" 2>&1
if errorlevel 1 goto fail5
echo   OK>> "%LOG%"
echo   OK
goto step6

:fail5
echo   FAIL -- install with: pythonw.exe -m pip install customtkinter>> "%LOG%"
echo   FAIL -- try:  pythonw.exe -m pip install customtkinter
goto cleanup

REM --- Step 6: gui-redesign.py present ------------------------------
:step6
echo.>> "%LOG%"
echo === Step 6: gui-redesign.py present ===>> "%LOG%"
echo.
echo === Step 6: gui-redesign.py present ===
if not exist gui-redesign.py goto fail6
echo   OK -- %CD%\gui-redesign.py>> "%LOG%"
echo   OK
goto step7

:fail6
echo   FAIL -- gui-redesign.py not in %CD%>> "%LOG%"
echo   FAIL
goto cleanup

REM --- Step 7: gui/ package present ---------------------------------
:step7
echo.>> "%LOG%"
echo === Step 7: gui/ package present ===>> "%LOG%"
echo.
echo === Step 7: gui/ package present ===
if not exist gui\__init__.py goto fail7
echo   OK -- %CD%\gui\>> "%LOG%"
echo   OK
goto step8

:fail7
echo   FAIL -- gui\__init__.py missing>> "%LOG%"
echo   FAIL
goto cleanup

REM --- Step 8: actually run the shim with python.exe (console) ------
REM   pythonw is silent on errors, so we use python.exe here to
REM   capture any import traceback in the log.
:step8
echo.>> "%LOG%"
echo === Step 8: run shim with python.exe (console) to see any error ===>> "%LOG%"
echo   This SHOULD pop the GUI window.>> "%LOG%"
echo   If it errors, the traceback will be in the log below.>> "%LOG%"
echo.>> "%LOG%"
echo.>> "%LOG%"
echo   --- python.exe gui-redesign.py output --- >> "%LOG%"
echo.
echo === Step 8: run shim (python.exe, console) -- see log for output ===
echo   Window may pop now. If not, see log.
echo.
python.exe gui-redesign.py >> "%LOG%" 2>&1
echo.>> "%LOG%"
echo   --- python.exe exited with code %errorlevel% --- >> "%LOG%"
echo.
echo   python.exe exited with code %errorlevel% (see log for full output)
echo.
goto cleanup

REM --- cleanup ------------------------------------------------------
:cleanup
popd >> "%LOG%" 2>&1

:done
echo.>> "%LOG%"
echo === Diagnostic done. Log: %LOG% >> "%LOG%"
echo.
echo === Diagnostic done ===
echo   Log saved to:
echo     %LOG%
echo.
echo   Open with:  notepad "%LOG%"
echo.
pause
endlocal