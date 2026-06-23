"""agent-box Windows Desktop GUI — thin shim around the modular package.

The full implementation lives in the ``gui/`` package. This file is
the canonical Windows entry point so existing shortcuts and launchers
(``launch-gui.bat``, ``launch-gui.ps1``, ``AgentBox.bat`` on the user's
Desktop) keep working.

Run on Windows with: ``python gui-redesign.py``

Stability notes
---------------
1. **Uses ``importlib``** to manually register the ``gui`` package in
   ``sys.modules``. The default Python import machinery has a long-
   standing bug on Windows + UNC paths (``\\\\wsl.localhost\\...``)
   where package-relative imports (``from gui.app import ...``) silently
   fail. Bypassing it makes the launch robust to that whole class of
   failure.

2. **Writes errors to a log file** when stderr isn't visible. pythonw
   is windowless, so any exception during launch would otherwise be
   completely invisible. The log lives next to this script as
   ``logs/gui-redesign-launch.log`` and is overwritten on each run.
"""
from __future__ import annotations

import importlib.util
import sys
import traceback
from pathlib import Path


_SCRIPT_DIR = Path(__file__).resolve().parent
_LOG_PATH = _SCRIPT_DIR / "logs" / "gui-redesign-launch.log"


def _log(msg: str) -> None:
    """Append a timestamped line to the launch log."""
    try:
        from datetime import datetime
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with _LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(f"[{ts}] {msg}\n")
    except Exception:
        # If we can't even write the log, give up silently — never
        # block launch on logging.
        pass


def _bootstrap() -> object:
    """Load ``gui`` + ``gui.app`` into ``sys.modules`` and return the app."""
    gui_dir = _SCRIPT_DIR / "gui"
    gui_init = gui_dir / "__init__.py"
    app_py = gui_dir / "app.py"

    _log(f"bootstrap start; script_dir={_SCRIPT_DIR}")
    _log(f"gui_dir={gui_dir} (exists={gui_dir.is_dir()})")
    _log(f"gui_init={gui_init} (exists={gui_init.is_file()})")
    _log(f"app_py={app_py} (exists={app_py.is_file()})")

    if not gui_init.is_file():
        raise FileNotFoundError(
            f"gui package not found at {gui_dir}. "
            "Re-clone the repo or restore the gui/ folder."
        )
    if not app_py.is_file():
        raise FileNotFoundError(f"gui/app.py missing at {app_py}")

    pkg_spec = importlib.util.spec_from_file_location(
        "gui", gui_init, submodule_search_locations=[str(gui_dir)],
    )
    if pkg_spec is None or pkg_spec.loader is None:
        raise RuntimeError(f"Failed to build import spec for gui package")
    gui_pkg = importlib.util.module_from_spec(pkg_spec)
    sys.modules["gui"] = gui_pkg
    pkg_spec.loader.exec_module(gui_pkg)
    _log("gui package loaded")

    app_spec = importlib.util.spec_from_file_location("gui.app", app_py)
    if app_spec is None or app_spec.loader is None:
        raise RuntimeError(f"Failed to build import spec for gui.app")
    app_mod = importlib.util.module_from_spec(app_spec)
    sys.modules["gui.app"] = app_mod
    app_spec.loader.exec_module(app_mod)
    _log("gui.app loaded")

    if not hasattr(app_mod, "main"):
        raise AttributeError("gui.app has no 'main' attribute")
    return app_mod


# Reset the log on every fresh launch so the file reflects the most
# recent attempt. We do this *before* bootstrap so a crash in bootstrap
# itself is also captured.
try:
    _LOG_PATH.write_text("", encoding="utf-8")
except Exception:
    pass

try:
    if getattr(sys, "frozen", False):
        # pyinstaller — UNC workaround unnecessary, files are local.
        import gui.app as _app_mod
        main = _app_mod.main
    else:
        _app = _bootstrap()
        main = _app.main
    _log("shim ready; main is callable")
except BaseException as exc:
    # Catch BaseException (not just Exception) so KeyboardInterrupt and
    # SystemExit are also recorded — useful when the user kills a
    # frozen process.
    tb = traceback.format_exc()
    _log(f"FATAL during bootstrap: {type(exc).__name__}: {exc}\n{tb}")

    # Best-effort: write a clear message to stderr too, in case the
    # log write fails or the launcher is capturing stderr.
    try:
        if sys.stderr is not None:
            sys.stderr.write(
                f"\n[agent-box] Failed to launch GUI: {type(exc).__name__}: {exc}\n"
                f"  See {_LOG_PATH} for the full traceback.\n"
            )
    except Exception:
        pass
    raise


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BaseException as exc:
        tb = traceback.format_exc()
        _log(f"FATAL during main(): {type(exc).__name__}: {exc}\n{tb}")
        raise