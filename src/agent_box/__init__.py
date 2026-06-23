"""agent-box: bwrap-isolated config launcher for coding agents."""

import re
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

try:
    __version__ = version("agent-box")
except PackageNotFoundError:
    # Source checkout — read the single source of truth from pyproject.toml
    _pyproject = Path(__file__).resolve().parent.parent.parent / "pyproject.toml"
    _m = re.search(
        r'^version\s*=\s*"([^"]+)"',
        _pyproject.read_text(encoding="utf-8"),
        re.MULTILINE,
    )
    __version__ = _m.group(1) if _m else "0.0.0"
