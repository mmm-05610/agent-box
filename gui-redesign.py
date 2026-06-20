"""agent-box Windows Desktop GUI — thin shim around the modular package.

The full implementation lives in the ``gui/`` package. This file is
kept as the canonical Windows entry point so existing shortcuts and
launchers (``launch-gui.bat``, ``launch-gui.ps1``, ``AgentBox.bat`` on
the user's Desktop) keep working.

Run on Windows with: ``python gui-redesign.py``

Why this shim uses ``importlib`` instead of ``from gui.app import main``:

The previous shim relied on Python's standard import machinery, which
on Windows + UNC paths (e.g. ``\\\\wsl.localhost\\Ubuntu\\...`` as
returned by ``pushd`` in the desktop launcher) has a long-standing
quirk where package-relative imports (``from gui.app import ...``)
silently fail. The original 1555-line ``gui-redesign.py`` worked
because it had no package imports — every dependency was either a
top-level ``import customtkinter`` style import (which works fine on
UNC) or a module-level definition.

This shim recovers the original's robustness by manually registering
the ``gui`` package in ``sys.modules`` via ``importlib.util``. That
bypasses the standard import machinery, so the relative imports
inside ``gui/app.py`` (e.g. ``from .components import NAV_ITEMS``)
still resolve correctly via the registered search locations.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


_SCRIPT_DIR = Path(__file__).resolve().parent
_GUI_DIR = _SCRIPT_DIR / "gui"
_GUI_INIT = _GUI_DIR / "__init__.py"
_APP_PY = _GUI_DIR / "app.py"


def _load_gui_package() -> None:
    """Register the ``gui`` package in ``sys.modules``.

    Done manually so that:

    - The script doesn't depend on ``sys.path[0]`` being a non-UNC
      path (the desktop bat runs from a ``pushd``-created drive that
      Windows can canonicalize back to a UNC path).
    - The relative imports inside ``gui/app.py`` resolve through the
      registered search locations rather than the fragile default
      finder.
    """
    if not _GUI_INIT.is_file():
        sys.stderr.write(
            f"\n[agent-box] gui package not found at {_GUI_DIR}\n"
            "  Re-clone the repo or restore the gui/ folder.\n",
        )
        sys.exit(1)
    if not _APP_PY.is_file():
        sys.stderr.write(
            f"\n[agent-box] gui/app.py missing at {_APP_PY}\n",
        )
        sys.exit(1)

    spec = importlib.util.spec_from_file_location(
        "gui", _GUI_INIT, submodule_search_locations=[str(_GUI_DIR)],
    )
    if spec is None or spec.loader is None:
        sys.stderr.write(
            f"\n[agent-box] Failed to build import spec for gui package.\n",
        )
        sys.exit(1)
    gui_pkg = importlib.util.module_from_spec(spec)
    sys.modules["gui"] = gui_pkg
    spec.loader.exec_module(gui_pkg)

    # Now load gui.app so its relative imports find the gui package.
    app_spec = importlib.util.spec_from_file_location("gui.app", _APP_PY)
    if app_spec is None or app_spec.loader is None:
        sys.stderr.write(
            f"\n[agent-box] Failed to build import spec for gui.app.\n",
        )
        sys.exit(1)
    app_mod = importlib.util.module_from_spec(app_spec)
    sys.modules["gui.app"] = app_mod
    app_spec.loader.exec_module(app_mod)
    return app_mod


_app = _load_gui_package()
main = _app.main


if __name__ == "__main__":
    sys.exit(main())