# Troubleshooting: Desktop GUI Launch

Lessons learned from debugging the Windows + WSL desktop launcher for `gui-redesign.py`.

## TL;DR

The original `gui-redesign.py` (1555 lines, self-contained) ran from any context
because it had no package imports. After refactoring into a `gui/` package, the
shim (`from gui.app import main`) **silently failed** on UNC paths — a known
Windows + Python importlib bug. Two structural fixes are required:

1. **Shim uses `importlib.util` to manually register the `gui` package**
   in `sys.modules`, bypassing the standard import machinery.
2. **Desktop bat retries `pushd` 10× with 2-second sleeps** to handle WSL 9P
   cold start after Windows reboot.

Both fixes are non-negotiable. Without them, the GUI fails to launch after
a reboot even though it works during a session.

## Background: how the GUI is launched

The desktop entry is `C:\Users\maoqh\Desktop\AgentBox.bat`. It launches
`gui-redesign.py` using **Windows Python** (not WSL Python, not the WSL venv)
because the user wants the GUI to register as a real Windows app, not a
WSLg-forwarded one.

The script lives at `\\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box\`
(WSL filesystem exposed via 9P). Windows Python reads it through the UNC path.

## Failure modes & fixes

### 1. UNC path + Python importlib silently fails

**Symptom**: Double-click the bat, the cmd window flashes, no GUI appears.
**No log, no traceback** — `pythonw.exe` is windowless.

**Root cause**: Python 3.12 on Windows has a long-standing bug where
`from <package>.<module> import <name>` silently fails when
`sys.path[0]` is a `\\wsl.localhost\...` UNC path. The original 1555-line
`gui-redesign.py` worked because it had no package imports — only
`import customtkinter as ctk` style imports.

**Fix**: The shim bypasses the standard import machinery:

```python
import importlib.util
pkg_spec = importlib.util.spec_from_file_location(
    "gui", gui_init, submodule_search_locations=[str(gui_dir)],
)
gui_pkg = importlib.util.module_from_spec(pkg_spec)
sys.modules["gui"] = gui_pkg
pkg_spec.loader.exec_module(gui_pkg)
# ... then load gui.app, which uses 'from .components import ...'
```

This works because relative imports inside `gui/app.py` resolve through the
registered search locations, not through `sys.path`.

### 2. WSL 9P cold start after reboot

**Symptom**: GUI launches work in a session, then fail after `shutdown /r`.

**Root cause**: After a Windows reboot, the WSL VM and 9P filesystem driver
take a few seconds to start up. The first `pushd \\wsl.localhost\...` usually
fails. The bat previously tried once and gave up.

**Fix**: Retry loop in `AgentBox.bat`:

```bat
set /a tries=0
:retry_pushd
set /a tries+=1
pushd "\\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box" >nul 2>&1
if not errorlevel 1 goto :pushd_ok
pushd "\\wsl$\Ubuntu\home\maoqh\projects\agent-box" >nul 2>&1
if not errorlevel 1 goto :pushd_ok
if %tries% geq 10 goto :pushd_fail
timeout /t 2 /nobreak >nul
goto :retry_pushd
```

10 attempts × 2 seconds = up to 20 seconds of waiting, which is enough for
the WSL VM to come up.

### 3. pythonw.exe is silent — log everything

**Symptom**: When anything goes wrong in the launch path (missing file,
import failure, widget construction error), the user sees nothing.

**Fix**: Two log files, written on every run:

| File                                     | Contents                                       |
| ---------------------------------------- | ---------------------------------------------- |
| `agent-box-launch.log` (desktop)         | Each bat step, retry count, success/failure    |
| `gui-redesign-launch.log` (project root) | Bootstrap path, package loads, fatal traceback |

When the GUI doesn't appear, the user opens these logs to find which step
failed.

### 4. Tk font weights: only "normal" and "bold"

**Symptom**: `_tkinter.TclError: unknown font style "semibold"` at startup.

**Root cause**: Tk's font system (which CustomTkinter delegates to) only
accepts `"normal"`, `"bold"`, `"italic"`, `"roman"`. `"medium"` and
`"semibold"` are rejected even though CSS / design systems use them.

**Fix**: Map all weight tokens to `"normal"` or `"bold"`. For visual
distinction, slightly adjust the font size instead (e.g., `FONT_SUBTITLE =
(FAMILY, 14, "bold")` for emphasis).

### 5. Bat file encoding: em-dash corrupts to `€?`

**Symptom**: `'$'\xe2\x80\x94' is not recognized as an internal or external
command` — or `'€?verbose'` when reading the bat.

**Root cause**: Bat files saved as UTF-8 are read by `cmd.exe` with the
system code page (often GBK / cp936 on Chinese Windows). The em-dash
(`—`, 0xE2 0x80 0x94) decodes to garbage, and cmd tries to execute it
as a command.

**Fix**: ASCII-only bat files. Replace `—` with `--`, drop emoji, drop
CJK punctuation. Use `REM` for comments, no fancy unicode.

### 6. `cd` doesn't support UNC paths

**Symptom**: `cd \\wsl.localhost\...\agent-box` fails with
`CMD 不支持将 UNC 路径作为当前目录`.

**Fix**: Use `pushd`, which creates a temp drive letter (e.g., `Z:`) and
switches to it. Always `popd` at the end.

### 7. `start` + pushd + UNC path quirks

**Symptom**: `start "" /D "Z:\..." pythonw.exe "Z:\...\script.py"` fails
silently after `pushd` succeeded.

**Root cause**: `start` does not reliably inherit the working directory
from the parent process for pushd-created temp drives. `/D` doesn't help.

**Fix**: Don't use `/D` or absolute paths. Use the simple form:

```bat
pushd "\\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box"
REM CWD is now Z:\home\maoqh\projects\agent-box
start /B pythonw.exe "%CD%\gui-redesign.py"
popd
```

`%CD%` gives the pushd-created drive path, which works inside `start /B`.

### 8. `call :label` with quoted arguments is fragile

**Symptom**: `'M' is not recognized as an internal or external command`
(or similar) when a `call :func` parses complex quoted args with `^` line
continuation.

**Root cause**: `cmd.exe` `call` argument parsing with escaped quotes
inside quoted strings can mis-tokenize the args. A word in a `'print(...)'`
argument can end up being interpreted as a command name.

**Fix**: Avoid function-style bats for complex workflows. Inline each step
with `goto :label` style control flow. It's longer but reliable.

### 9. No WSL display = can't smoke-test the GUI from WSL bash

**Symptom**: Running `python3 gui-redesign.py` from WSL fails with
`couldn't connect to display ":0"`.

**Workaround for testing**: Use `python.exe` (Windows Python) invoked from
WSL bash. It runs on the Windows side and can create a display. The test
will hang in `mainloop()` — that's success. Kill it with timeout.

For automated smoke tests, use the smoke test script
(`scripts/smoke_test_gui.py`) which exercises the import chain and
theme/state/WSL helpers without instantiating `ctk.CTk()`.

## Diagnostic workflow

When the user reports "GUI won't launch", follow these steps:

1. **Run the desktop bat from cmd** to see any pause/error messages.
2. **Check the two log files**:
   - `C:\Users\maoqh\Desktop\agent-box-launch.log` — bat steps
   - `\\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box\gui-redesign-launch.log` — shim steps
3. **Reproduce manually** in cmd:

   ```cmd
   pushd \\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box
   python.exe gui-redesign.py
   ```

   This shows the full traceback if there's a runtime error in the shim or
   in the GUI construction. (Use `python.exe`, not `pythonw.exe`, to see
   stderr.)

4. **If only pythonw fails silently**, swap `pythonw.exe` for `python.exe`
   in the bat temporarily to capture the error.

## Files involved

| File                                  | Role                                 |
| ------------------------------------- | ------------------------------------ |
| `C:\Users\maoqh\Desktop\AgentBox.bat` | Desktop entry point                  |
| `gui-redesign.py`                     | Windows entry shim (importlib-based) |
| `gui/app.py`                          | Application orchestrator             |
| `gui/components/*.py`                 | Reusable widgets                     |
| `gui/pages/*.py`                      | Page-level views                     |

## What was tried but didn't work

- `start "" pythonw.exe gui-redesign.py` — empty title + simple args:
  fails because `start` doesn't pick up the right working directory after
  pushd.
- `start "AgentBox" /D "%CD%" pythonw.exe "%CD%\gui-redesign.py"` — explicit
  title + /D + absolute path: also fails, `start /D` doesn't reliably
  cooperate with pushd-created temp drives.
- `start "" pythonw.exe \\wsl.localhost\...\gui-redesign.py` — full UNC
  path without pushd: works in some configs but the importlib issue
  reappears when Python canonicalizes the UNC path.
- Using `wsl.exe bash -c "...\.venv/bin/python..."` (WSL Python): works,
  but the user prefers a real Windows app (no WSLg forwarding).
