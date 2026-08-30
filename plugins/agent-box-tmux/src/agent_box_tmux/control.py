"""Product-specific operations over a materialized tmux console.

This is deliberately a tmux plugin API, not an Agent-Box Core console
abstraction.  Consumers that explicitly integrate with tmux can use it until
another console product provides enough evidence to justify a shared Contract.
"""
from __future__ import annotations

import shlex
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from .contract import TmuxConsoleV1, TmuxPaneV1

_SHELLS = frozenset({"ash", "bash", "csh", "dash", "fish", "ksh", "nu", "pwsh", "sh", "tcsh", "zsh"})


@dataclass(frozen=True)
class TmuxPaneObservation:
    reachable: bool
    pane_id: str
    pid: int | None = None
    dead: bool | None = None
    exit_status: int | None = None
    current_command: str | None = None
    current_path: str | None = None
    start_command: str | None = None


class TmuxConsoleController:
    """Launch and observe tmux-plugin console or exact existing-pane values."""

    _Resource = TmuxConsoleV1 | TmuxPaneV1

    @staticmethod
    def _validate_pane(console: _Resource, pane_id: str) -> None:
        if isinstance(console, TmuxPaneV1):
            if pane_id != console.pane_id:
                raise ValueError(f"pane does not match frozen pane identity: {pane_id}")
        elif pane_id not in console.pane_ids:
            raise ValueError(f"pane does not belong to console: {pane_id}")

    @staticmethod
    def _call(console: _Resource, *args: str) -> subprocess.CompletedProcess[str]:
        socket_args = (
            ("-S", str(console.socket_path))
            if isinstance(console, TmuxPaneV1)
            else ("-L", console.socket_name)
        )
        return subprocess.run(
            [str(console.binary), *socket_args, *args],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

    @classmethod
    def _run(cls, console: _Resource, *args: str) -> str:
        completed = cls._call(console, *args)
        if completed.returncode != 0:
            detail = completed.stderr.strip() or completed.stdout.strip()
            raise RuntimeError(f"tmux command failed: {detail}")
        return completed.stdout.rstrip("\n")

    @classmethod
    def _existing_identity_row(cls, pane: TmuxPaneV1) -> list[str]:
        fields = (
            "#{socket_path}\t#{pid}\t#{session_id}\t#{session_name}\t"
            "#{window_id}\t#{pane_id}\t#{pane_pid}\t#{pane_current_command}\t"
            "#{pane_current_path}\t#{pane_dead}\t#{pane_dead_status}\t"
            "#{pane_start_command}"
        )
        completed = cls._call(
            pane, "display-message", "-p", "-t", pane.pane_id, fields
        )
        if completed.returncode != 0:
            return []
        rows = completed.stdout.rstrip("\n").splitlines()
        if len(rows) != 1:
            raise ValueError("frozen tmux pane no longer resolves to one pane")
        row = rows[0].split("\t", 11)
        if len(row) != 12:
            raise RuntimeError("tmux returned an invalid existing-pane observation")
        actual_socket = Path(row[0]).expanduser().resolve()
        if (
            actual_socket != pane.socket_path
            or int(row[1]) != pane.server_pid
            or row[2] != pane.session_id
            or row[3] != pane.session_name
            or row[4] != pane.window_id
            or row[5] != pane.pane_id
        ):
            raise ValueError("tmux pane identity differs from frozen pane Contract")
        return row

    @classmethod
    def _assert_idle_shell(cls, pane: TmuxPaneV1, row: list[str]) -> None:
        del pane
        if row[9] != "0":
            raise ValueError("idle-shell-only refuses to replace a dead pane")
        command = row[7].strip().rsplit("/", 1)[-1].lower()
        if command not in _SHELLS:
            raise ValueError("idle-shell-only refuses to replace an active pane")

    def launch(
        self,
        console: _Resource,
        pane_id: str,
        argv: Sequence[str],
        *,
        cwd: str | Path,
    ) -> None:
        """Replace a pane shell with an exact argv without a send-keys race."""
        self._validate_pane(console, pane_id)
        if not argv or any(not isinstance(item, str) or not item for item in argv):
            raise ValueError("tmux launch argv must contain non-empty strings")
        launch_dir = Path(cwd).resolve()
        if not launch_dir.is_dir():
            raise ValueError(f"tmux launch cwd is not a directory: {launch_dir}")
        if isinstance(console, TmuxPaneV1):
            row = self._existing_identity_row(console)
            if not row:
                raise ValueError("frozen tmux pane is no longer available")
            if console.replace_policy == "idle-shell-only":
                self._assert_idle_shell(console, row)
        command = "exec " + shlex.join(tuple(argv))
        self._run(
            console,
            "set-option",
            "-p",
            "-t",
            pane_id,
            "remain-on-exit",
            "on",
        )
        self._run(
            console,
            "respawn-pane",
            "-k",
            "-c",
            str(launch_dir),
            "-t",
            pane_id,
            command,
        )

    def inspect(
        self, console: _Resource, pane_id: str
    ) -> TmuxPaneObservation:
        self._validate_pane(console, pane_id)
        if isinstance(console, TmuxPaneV1):
            self._existing_identity_row(console)
        fields = (
            "#{pane_pid}\t#{pane_dead}\t#{pane_dead_status}\t"
            "#{pane_current_command}\t#{pane_current_path}\t#{pane_start_command}"
        )
        completed = self._call(
            console, "display-message", "-p", "-t", pane_id, fields
        )
        if completed.returncode != 0:
            return TmuxPaneObservation(False, pane_id)
        row = completed.stdout.rstrip("\n").split("\t", 5)
        if len(row) != 6:
            raise RuntimeError("tmux returned an invalid pane observation")
        raw_pid, raw_dead, raw_status, command, path, start_command = row
        return TmuxPaneObservation(
            True,
            pane_id,
            int(raw_pid) if raw_pid else None,
            raw_dead == "1",
            int(raw_status) if raw_status else None,
            command or None,
            path or None,
            start_command or None,
        )

    def capture(self, console: _Resource, pane_id: str) -> str:
        """Capture the visible pane and available tmux scrollback."""
        self._validate_pane(console, pane_id)
        return self._run(
            console, "capture-pane", "-p", "-J", "-S", "-", "-t", pane_id
        )

    def cleanup(self, console: _Resource) -> None:
        if isinstance(console, TmuxPaneV1):
            row = self._existing_identity_row(console)
            if not row:
                return
            # Finish has already captured scrollback.  Restore a usable shell
            # in this pane only; never kill the user's session or other panes.
            path = row[8] or str(console.current_path)
            completed = self._call(
                console,
                "respawn-pane",
                "-k",
                "-c",
                path,
                "-t",
                console.pane_id,
                "exec /bin/sh",
            )
            if completed.returncode != 0:
                detail = completed.stderr.strip() or completed.stdout.strip()
                raise RuntimeError(f"tmux pane cleanup failed: {detail}")
            self._run(console, "set-option", "-p", "-t", console.pane_id, "remain-on-exit", "off")
            return
        completed = self._call(
            console, "kill-session", "-t", console.session_name
        )
        if completed.returncode not in (0, 1):
            detail = completed.stderr.strip() or completed.stdout.strip()
            raise RuntimeError(f"tmux cleanup failed: {detail}")

    def release(self, console: _Resource) -> None:
        """Release the resource using its tmux-specific safety semantics."""
        self.cleanup(console)
