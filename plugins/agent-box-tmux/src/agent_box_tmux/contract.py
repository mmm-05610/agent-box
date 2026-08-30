from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar
from urllib.parse import quote


@dataclass(frozen=True)
class TmuxConsoleV1:
    """A materialized execution-scoped tmux console."""

    contract_id: ClassVar[str] = "agent-box-tmux.console@1"

    binary: Path
    version: str
    spec_digest: str
    socket_name: str
    session_name: str
    session_id: str
    pane_ids: tuple[str, ...]
    attach_command: tuple[str, ...]

    def __post_init__(self) -> None:
        if not self.binary.is_absolute():
            raise ValueError("tmux binary path must be absolute")
        for name, value in (
            ("version", self.version),
            ("spec_digest", self.spec_digest),
            ("socket_name", self.socket_name),
            ("session_name", self.session_name),
            ("session_id", self.session_id),
        ):
            if not isinstance(value, str) or not value:
                raise ValueError(f"tmux console {name} is required")
        if not self.pane_ids:
            raise ValueError("tmux console must contain at least one pane")


@dataclass(frozen=True)
class TmuxPaneV1:
    """An exact identity for a pane that already belongs to the user.

    This is intentionally a tmux-plugin Contract.  The socket, server and
    session fields are parent coordinates; the pane id is the execution
    resource being bound.
    """

    contract_id: ClassVar[str] = "agent-box-tmux.pane@1"

    binary: Path
    version: str
    socket_path: Path
    server_pid: int
    session_id: str
    session_name: str
    window_id: str
    pane_id: str
    pane_pid: int
    original_path: Path
    current_path: Path
    original_command: str
    current_command: str
    attach_command: tuple[str, ...]
    replace_policy: str = "idle-shell-only"

    def __post_init__(self) -> None:
        if not self.binary.is_absolute() or not self.socket_path.is_absolute():
            raise ValueError("tmux binary and socket paths must be absolute")
        if self.server_pid <= 0 or self.pane_pid <= 0:
            raise ValueError("tmux server and pane PIDs must be positive")
        for name, value in (
            ("version", self.version),
            ("session_id", self.session_id),
            ("session_name", self.session_name),
            ("window_id", self.window_id),
            ("pane_id", self.pane_id),
            ("original_command", self.original_command),
            ("current_command", self.current_command),
        ):
            if not isinstance(value, str) or not value:
                raise ValueError(f"tmux pane {name} is required")
        if not self.pane_id.startswith("%"):
            raise ValueError("tmux pane_id must be an exact pane id")
        if not self.original_path.is_absolute() or not self.current_path.is_absolute():
            raise ValueError("tmux pane paths must be absolute")
        if self.replace_policy not in {"idle-shell-only", "force-replace"}:
            raise ValueError(f"unsupported tmux pane replace policy: {self.replace_policy}")
        if not self.attach_command:
            raise ValueError("tmux pane attach command is required")

    @property
    def identity_uri(self) -> str:
        """A readable, non-secret URI suitable for audit/correlation output."""
        return (
            "tmux://pane/"
            + quote(self.pane_id, safe="%")
            + "?socket_path="
            + quote(str(self.socket_path), safe="")
            + "&server_pid="
            + str(self.server_pid)
            + "&session_id="
            + quote(self.session_id, safe="")
            + "&session_name="
            + quote(self.session_name, safe="")
            + "&window_id="
            + quote(self.window_id, safe="")
            + "&pane_id="
            + quote(self.pane_id, safe="%")
        )
