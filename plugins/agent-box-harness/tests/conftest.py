"""Make the plugin src layouts importable without an editable install.

Every existing plugin test in this repository assumes the runner puts
`src` plus each `plugins/*/src` on `PYTHONPATH` (see
`harness/work/python-column-b3.sh`). The extraction adds one more src root, so
these tests state that assumption instead of relying on the caller to guess it.

Only paths are added; nothing here reorders or replaces already-importable
packages, and both the core and the legacy name must be importable for the
identity pin to mean anything.
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

for _root in (REPO_ROOT / "src", *sorted((REPO_ROOT / "plugins").glob("*/src"))):
    if _root.is_dir() and str(_root) not in sys.path:
        sys.path.append(str(_root))
