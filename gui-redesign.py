"""agent-box Windows Desktop GUI — thin shim around the modular package.

The full implementation now lives in the ``gui/`` package. This file is
kept as the canonical Windows entry point so existing shortcuts and
launchers (``launch-gui.bat``, ``launch-gui.ps1``) keep working.

Run on Windows with: ``python gui-redesign.py``
"""
from __future__ import annotations

import sys

from gui.app import main


if __name__ == "__main__":
    sys.exit(main())