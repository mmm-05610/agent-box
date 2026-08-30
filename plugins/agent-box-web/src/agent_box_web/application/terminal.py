"""Web Host presenter for opening a provider-owned native terminal."""
from __future__ import annotations
from dataclasses import dataclass
import os
import shutil
import subprocess
from typing import Callable, Sequence

@dataclass(frozen=True)
class TerminalOpenResult:
    status: str
    diagnostic: str
    def public(self) -> dict[str, str]:
        return {"status": self.status, "diagnostic": self.diagnostic}

class WslTerminalPresenter:
    """Present one validated Linux attach command in Windows Terminal."""
    def __init__(self, *, launcher: Callable[..., object] | None = None,
                 which: Callable[[str], str | None] = shutil.which,
                 environ: dict[str, str] | None = None) -> None:
        self._launcher = launcher or subprocess.Popen
        self._which = which
        self._environ = environ if environ is not None else os.environ
    @staticmethod
    def _validate_attach(argv: Sequence[str]) -> tuple[str, ...]:
        value = tuple(argv)
        if not value or any(not isinstance(item, str) or not item for item in value):
            raise ValueError("provider attach descriptor is empty or invalid")
        if value[0].rsplit("/", 1)[-1] != "tmux":
            raise ValueError("unsupported terminal attach executable")
        if any(item in {";", "&&", "|", "`"} for item in value):
            raise ValueError("provider attach descriptor contains shell syntax")
        return value
    def open(self, argv: Sequence[str]) -> TerminalOpenResult:
        try: attach = self._validate_attach(argv)
        except ValueError as exc: return TerminalOpenResult("failed", str(exc)[:240])
        distro = self._environ.get("WSL_DISTRO_NAME", "").strip()
        if not distro: return TerminalOpenResult("unavailable", "WSL distribution is not identified")
        wt = self._which("wt.exe")
        if not wt: return TerminalOpenResult("unavailable", "Windows Terminal wt.exe is not available")
        try:
            self._launcher((wt, "wsl.exe", "-d", distro, "--", *attach), shell=False, start_new_session=True)
        except (OSError, subprocess.SubprocessError) as exc:
            return TerminalOpenResult("failed", f"Windows Terminal launch failed: {exc}"[:240])
        return TerminalOpenResult("opened", "Windows Terminal launch requested")

class UnavailableTerminalPresenter:
    def open(self, argv: Sequence[str]) -> TerminalOpenResult:
        del argv
        return TerminalOpenResult("unavailable", "Interactive terminal presentation is deferred on this platform")
