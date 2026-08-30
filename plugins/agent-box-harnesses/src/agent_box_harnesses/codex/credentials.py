from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any


class CodexCredentialSource:
    """Plugin-owned, non-secret projection of the native Codex login."""

    locator = "codex-login/default"
    provider = "codex"

    def __init__(self, *, home: Path | None = None, binary: str | None = None) -> None:
        self.home = (home or Path.home()).resolve()
        self.binary = binary or shutil.which("codex")

    def validate(self, value: Any) -> None:
        if value is None:
            return
        if not isinstance(value, dict) or value.get("provider") != self.provider or value.get("native_locator") != self.locator:
            raise ValueError("UNSUPPORTED_CODEX_CREDENTIAL_SOURCE")
        if set(value) - {"provider", "native_locator", "revision", "digest"}:
            raise ValueError("UNSUPPORTED_CODEX_CREDENTIAL_SOURCE")

    def _source(self) -> Path:
        source = self.home / ".codex" / "auth.json"
        if not source.is_file() or source.is_dir():
            raise ValueError("CODEX_LOGIN_SOURCE_UNAVAILABLE")
        return source

    def project(self, execution_root: Path, value: Any) -> dict[str, Any]:
        self.validate(value)
        if value is None:
            return {"identity": None, "method": "none", "materialized": False}
        source = self._source()
        root = execution_root.resolve()
        if source.resolve() == root or root in source.resolve().parents:
            raise ValueError("CODEX_LOGIN_SOURCE_IN_PROJECTION")
        target = root / "auth.json"
        if target.exists() or target.is_symlink():
            raise ValueError("CODEX_AUTH_TARGET_EXISTS")
        target.symlink_to(source)
        return {"identity": self.locator, "method": "controlled-symlink", "materialized": True}

    def cleanup(self, execution_root: Path) -> None:
        target = execution_root.resolve() / "auth.json"
        if target.is_symlink():
            target.unlink()

    def diagnostics(self) -> dict[str, Any]:
        try:
            available = self._source().is_file()
        except ValueError:
            available = False
        status = "unknown"
        if self.binary:
            try:
                result = subprocess.run([self.binary, "login", "status"], capture_output=True, text=True, timeout=5, check=False)
                output = ((result.stdout or "") + (result.stderr or ""))[:512].lower()
                if "not logged in" in output:
                    status = "not-logged-in"
                elif "logged in" in output:
                    status = "logged-in"
            except (OSError, subprocess.SubprocessError):
                pass
        return {"available": available, "login_status": status, "locator": self.locator}
