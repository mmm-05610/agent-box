"""Pacthold: the execution governance kernel for coding agents.

The import path stays `agent_box` on purpose (order 61): it is a compatibility
surface that installed plugins discover through, not a display name.
"""

import re
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

try:
    __version__ = version("pacthold")
except PackageNotFoundError:
    try:
        # An installation that predates the rename still reports a version.
        __version__ = version("agent-box-cli")
    except PackageNotFoundError:
        __version__ = None
if __version__ is None:
    # Source checkout — read the single source of truth from pyproject.toml
    _pyproject = Path(__file__).resolve().parent.parent.parent / "pyproject.toml"
    _m = re.search(
        r'^version\s*=\s*"([^"]+)"',
        _pyproject.read_text(encoding="utf-8"),
        re.MULTILINE,
    )
    __version__ = _m.group(1) if _m else "0.0.0"
