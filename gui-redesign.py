"""agent-box Windows Desktop GUI — thin shim around the modular package.

The full implementation lives in the ``gui/`` package. This file is
kept as the canonical Windows entry point so existing shortcuts and
launchers (``launch-gui.bat``, ``launch-gui.ps1``, ``AgentBox.bat`` on
the user's Desktop) keep working.

Run on Windows with: ``python gui-redesign.py``

Why the defensive ``sys.path`` block: when Windows runs the shim from
a UNC path (e.g. ``\\\\wsl.localhost\\Ubuntu\\...`` as the desktop
launcher does), some Python versions occasionally fail to add the
script's directory to ``sys.path`` automatically. Adding it explicitly
sidesteps the issue and also surfaces a clear error if ``gui/`` is
truly missing.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Defensive: ensure the script's directory is on sys.path before the
# package import. This protects against Windows + UNC + Python 3.12
# importlib quirks where ``sys.path[0]`` may not be the script dir.
_SCRIPT_DIR = str(Path(__file__).resolve().parent)
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

try:
    from gui.app import main
except ImportError as exc:
    sys.stderr.write(
        f"\n[agent-box] Failed to import gui.app: {exc}\n"
        f"  __file__   = {__file__!r}\n"
        f"  sys.path[0] = {sys.path[0]!r}\n"
        f"  CWD        = {Path.cwd()!r}\n"
        "\n"
        "  Common causes:\n"
        "    - gui/ package is missing (check the project tree)\n"
        "    - You're running from a copy that lost the gui/ folder\n"
        "    - The script's directory is not on sys.path (rare)\n"
        "\n"
        "  If this is a UNC path issue, run from WSL:\n"
        "    wsl.exe -d Ubuntu bash -lc \"cd /home/maoqh/projects/agent-box && "
        ".venv/bin/python gui-redesign.py\"\n"
    )
    raise


if __name__ == "__main__":
    sys.exit(main())