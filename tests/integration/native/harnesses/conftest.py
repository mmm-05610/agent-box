"""Capability gating for tests that require a real native sandbox."""
from __future__ import annotations

import shutil
import subprocess

import pytest


def _bwrap_namespace_available() -> bool:
    binary = shutil.which("bwrap")
    if binary is None:
        return False
    result = subprocess.run(
        [binary, "--ro-bind", "/", "/", "--unshare-user", "--unshare-pid", "--proc", "/proc", "true"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def pytest_collection_modifyitems(config, items):
    if _bwrap_namespace_available():
        return
    reason = "native bwrap unavailable: binary missing or namespace capability denied"
    marker = pytest.mark.skip(reason=reason)
    for item in items:
        if "/harnesses/" in str(item.fspath):
            item.add_marker(marker)
