from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import quote

from agent_box.work_core import ProviderDescriptor, Ref, RefType

from .contract import TmuxConsoleV1, TmuxPaneV1


_SAFE_NAME = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_LAYOUTS = frozenset({"even-horizontal", "even-vertical", "main-horizontal", "main-vertical", "tiled"})
_REPLACE_POLICIES = frozenset({"idle-shell-only", "force-replace"})
_PANE_ID = re.compile(r"^%[0-9]+$")


class TmuxConsoleResourceProvider:
    provider_id = "tmux-console"
    supported_contract_ids = frozenset(
        {TmuxConsoleV1.contract_id, TmuxPaneV1.contract_id}
    )

    def __init__(self, binary: str | Path | None = None) -> None:
        candidate = str(binary) if binary is not None else shutil.which("tmux")
        if not candidate:
            raise RuntimeError("tmux binary was not found")
        self.binary = Path(candidate).resolve()
        self.version = self._run("-V")

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "tmux console", "0.1.0")

    def make_ref(
        self,
        execution_id: str,
        *,
        panes: int = 1,
        layout: str = "tiled",
    ) -> Ref:
        suffix = re.sub(r"[^A-Za-z0-9_-]", "-", execution_id)[-40:]
        session_name = f"abx-{suffix}"
        socket_name = f"abx-{suffix}"
        if not 1 <= panes <= 8:
            raise ValueError("tmux pane count must be between 1 and 8")
        if layout not in _LAYOUTS:
            raise ValueError(f"unsupported tmux layout: {layout}")
        spec = {
            "layout": layout,
            "panes": panes,
            "session_name": session_name,
            "socket_name": socket_name,
            "tmux_version": self.version,
        }
        digest = "sha256:" + hashlib.sha256(
            json.dumps(spec, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        return Ref(
            RefType.ARTIFACT,
            self.provider_id,
            digest,
            metadata={
                "session_name": session_name,
                "socket_name": socket_name,
                "panes": str(panes),
                "layout": layout,
                "tmux_version": self.version,
            },
        )

    def resolve(self, contract_id: str, ref: Ref) -> TmuxConsoleV1 | TmuxPaneV1:
        if contract_id == TmuxPaneV1.contract_id:
            return self._resolve_existing_pane(ref)
        if contract_id != TmuxConsoleV1.contract_id:
            raise ValueError(f"unsupported contract: {contract_id}")
        if ref.type is not RefType.ARTIFACT or ref.provider != self.provider_id:
            raise ValueError("tmux console contract requires a tmux console spec ArtifactRef")
        session_name = ref.metadata.get("session_name", "")
        socket_name = ref.metadata.get("socket_name", "")
        layout = ref.metadata.get("layout", "")
        if not _SAFE_NAME.fullmatch(session_name) or not _SAFE_NAME.fullmatch(socket_name):
            raise ValueError("tmux socket/session name is unsafe")
        if ref.metadata.get("tmux_version") != self.version:
            raise ValueError("installed tmux version differs from frozen Ref")
        try:
            panes = int(ref.metadata.get("panes", ""))
        except ValueError as exc:
            raise ValueError("tmux pane count is invalid") from exc
        if not 1 <= panes <= 8 or layout not in _LAYOUTS:
            raise ValueError("tmux console projection is invalid")
        spec = {
            "layout": layout,
            "panes": panes,
            "session_name": session_name,
            "socket_name": socket_name,
            "tmux_version": self.version,
        }
        digest = "sha256:" + hashlib.sha256(
            json.dumps(spec, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        if ref.native_id != digest:
            raise ValueError("tmux console spec differs from frozen ArtifactRef")

        # Target the session, not a numeric window. User tmux configuration
        # may set ``base-index`` to a value other than zero.
        target = session_name
        exists = self._call("-L", socket_name, "has-session", "-t", session_name).returncode == 0
        if not exists:
            self._run("-L", socket_name, "new-session", "-d", "-s", session_name, "-n", "execution")
            for _ in range(panes - 1):
                self._run("-L", socket_name, "split-window", "-d", "-t", target)
            self._run("-L", socket_name, "select-layout", "-t", target, layout)
            self._run("-L", socket_name, "set-option", "-t", session_name, "@agent_box_ref", digest)
        marker = self._run("-L", socket_name, "show-option", "-v", "-t", session_name, "@agent_box_ref")
        if marker != digest:
            raise ValueError("existing tmux session is not owned by this frozen Ref")
        rows = self._run(
            "-L", socket_name, "list-panes", "-t", target, "-F", "#{session_id}\t#{pane_id}"
        ).splitlines()
        if len(rows) != panes:
            raise ValueError("materialized tmux pane count differs from frozen Ref")
        session_ids = {row.split("\t", 1)[0] for row in rows}
        pane_ids = tuple(row.split("\t", 1)[1] for row in rows)
        if len(session_ids) != 1:
            raise ValueError("tmux returned inconsistent session identities")
        return TmuxConsoleV1(
            binary=self.binary,
            version=self.version,
            spec_digest=digest,
            socket_name=socket_name,
            session_name=session_name,
            session_id=session_ids.pop(),
            pane_ids=pane_ids,
            attach_command=(str(self.binary), "-L", socket_name, "attach", "-t", session_name),
        )

    def make_existing_pane_ref(
        self,
        target: str,
        *,
        socket_path: Path | None = None,
        replace_policy: str = "idle-shell-only",
    ) -> Ref:
        """Freeze the exact identity of an already-existing tmux pane."""
        self._validate_replace_policy(replace_policy)
        if not isinstance(target, str) or not _PANE_ID.fullmatch(target):
            raise ValueError("existing tmux pane target must be an exact pane id like %3")
        requested_socket = self._canonical_socket_path(socket_path) if socket_path else None
        snapshot = self._query_existing_pane(target, requested_socket)
        return self._existing_pane_ref(snapshot, replace_policy)

    def list_existing_panes(self, *, socket_path: Path | None = None) -> tuple[dict[str, str], ...]:
        """Return a live, display-safe pane catalog for a Host selector.

        This is only a current observation. ``make_existing_pane_ref`` remains
        the authority that freezes and validates one exact pane.
        """
        fields = (
            "#{socket_path}\t#{session_name}\t#{window_name}\t#{pane_id}\t"
            "#{pane_current_command}\t#{pane_current_path}"
        )
        completed = self._call_socket(socket_path, "list-panes", "-a", "-F", fields)
        if completed.returncode != 0:
            detail = completed.stderr.strip() or completed.stdout.strip()
            raise RuntimeError(f"tmux pane listing failed: {detail}")
        result: list[dict[str, str]] = []
        for row in completed.stdout.rstrip("\n").splitlines():
            values = row.split("\t", 5)
            if len(values) != 6:
                continue
            actual_socket, session, window, pane, command, cwd = values
            if not _PANE_ID.fullmatch(pane):
                continue
            result.append({
                "socket_path": str(self._canonical_socket_path(Path(actual_socket))),
                "session_name": session,
                "window_name": window,
                "pane_id": pane,
                "command": command,
                "cwd": cwd,
            })
        return tuple(result)

    def _resolve_existing_pane(self, ref: Ref) -> TmuxPaneV1:
        if ref.type is not RefType.SESSION or ref.provider != self.provider_id:
            raise ValueError("tmux pane contract requires a tmux-console SessionRef")
        metadata = ref.metadata
        required = (
            "tmux_version", "socket_path", "server_pid", "session_id",
            "session_name", "window_id", "pane_id", "pane_pid",
            "original_path", "current_path", "original_command",
            "current_command", "replace_policy",
        )
        if any(not metadata.get(key) for key in required):
            raise ValueError("tmux pane Ref is missing frozen identity metadata")
        self._validate_replace_policy(metadata["replace_policy"])
        if metadata["tmux_version"] != self.version:
            raise ValueError("installed tmux version differs from frozen pane Ref")
        try:
            server_pid = int(metadata["server_pid"])
            pane_pid = int(metadata["pane_pid"])
        except ValueError as exc:
            raise ValueError("tmux pane Ref contains an invalid PID") from exc
        socket_path = self._canonical_socket_path(Path(metadata["socket_path"]))
        snapshot = self._query_existing_pane(metadata["pane_id"], socket_path)
        expected = {
            "socket_path": str(socket_path),
            "server_pid": server_pid,
            "session_id": metadata["session_id"],
            "session_name": metadata["session_name"],
            "window_id": metadata["window_id"],
            "pane_id": metadata["pane_id"],
            "pane_pid": pane_pid,
            "original_path": metadata["original_path"],
            "current_path": metadata["current_path"],
            "original_command": metadata["original_command"],
            "current_command": metadata["current_command"],
            "replace_policy": metadata["replace_policy"],
        }
        # pane_pid and the observed command/path are intentionally snapshots,
        # not pane identity.  The server/session/window/pane coordinates are
        # the immutable identity; launch-time policy rechecks the live pane.
        for key in ("socket_path", "server_pid", "session_id", "session_name", "window_id", "pane_id"):
            if snapshot[key] != expected[key]:
                raise ValueError(f"tmux pane identity differs from frozen Ref: {key}")
        identity_ref = self._existing_pane_ref(snapshot, metadata["replace_policy"])
        if ref.native_id != identity_ref.native_id or ref.uri != identity_ref.uri:
            raise ValueError("tmux pane identity differs from frozen SessionRef")
        return TmuxPaneV1(
            self.binary,
            self.version,
            socket_path,
            server_pid,
            metadata["session_id"],
            metadata["session_name"],
            metadata["window_id"],
            metadata["pane_id"],
            int(snapshot["pane_pid"]),
            Path(metadata["original_path"]),
            Path(str(snapshot["current_path"] or metadata["current_path"])),
            metadata["original_command"],
            str(snapshot["current_command"] or metadata["current_command"]),
            (str(self.binary), "-S", str(socket_path), "attach", "-t", metadata["session_name"]),
            metadata["replace_policy"],
        )

    @staticmethod
    def _validate_replace_policy(policy: str) -> None:
        if policy not in _REPLACE_POLICIES:
            raise ValueError(
                "tmux pane replace_policy must be idle-shell-only or force-replace"
            )

    @staticmethod
    def _canonical_socket_path(path: Path) -> Path:
        return path.expanduser().resolve()

    def _query_existing_pane(
        self, target: str, socket_path: Path | None
    ) -> dict[str, object]:
        fields = (
            "#{socket_path}\t#{pid}\t#{session_id}\t#{session_name}\t"
            "#{window_id}\t#{pane_id}\t#{pane_pid}\t#{pane_current_path}\t"
            "#{pane_current_command}"
        )
        # `list-panes -t %N` selects the pane's *window* and returns every
        # pane in that window.  `display-message -p -t %N` resolves the exact
        # pane target and renders one identity row, which is the contract this
        # method must freeze.
        completed = self._call_socket(
            socket_path, "display-message", "-p", "-t", target, fields
        )
        if completed.returncode != 0:
            detail = completed.stderr.strip() or completed.stdout.strip()
            raise ValueError(f"tmux pane target is unavailable: {detail}")
        rows = completed.stdout.rstrip("\n").splitlines()
        if len(rows) != 1:
            raise ValueError("tmux target must resolve to exactly one pane")
        values = rows[0].split("\t", 8)
        if len(values) != 9:
            raise RuntimeError("tmux returned an invalid pane identity")
        (
            actual_socket, raw_server_pid, session_id, session_name, window_id,
            pane_id, raw_pane_pid, current_path, current_command,
        ) = values
        if pane_id != target:
            raise ValueError("tmux target did not resolve to the requested exact pane")
        try:
            server_pid = int(raw_server_pid)
            pane_pid = int(raw_pane_pid)
        except ValueError as exc:
            raise RuntimeError("tmux returned invalid pane/server PID values") from exc
        actual_socket_path = self._canonical_socket_path(Path(actual_socket))
        if socket_path is not None and actual_socket_path != socket_path:
            raise ValueError("tmux pane is attached to a different socket path")
        return {
            "socket_path": str(actual_socket_path),
            "server_pid": server_pid,
            "session_id": session_id,
            "session_name": session_name,
            "window_id": window_id,
            "pane_id": pane_id,
            "pane_pid": pane_pid,
            "original_path": current_path,
            "current_path": current_path,
            "original_command": current_command,
            "current_command": current_command,
        }

    def _existing_pane_ref(self, snapshot: dict[str, object], replace_policy: str) -> Ref:
        self._validate_replace_policy(replace_policy)
        identity = {
            "socket_path": snapshot["socket_path"],
            "server_pid": snapshot["server_pid"],
            "session_id": snapshot["session_id"],
            "session_name": snapshot["session_name"],
            "window_id": snapshot["window_id"],
            "pane_id": snapshot["pane_id"],
            "replace_policy": replace_policy,
            "tmux_version": self.version,
        }
        digest = "sha256:" + hashlib.sha256(
            json.dumps(identity, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        metadata = {
            "tmux_version": self.version,
            "socket_path": str(snapshot["socket_path"]),
            "server_pid": str(snapshot["server_pid"]),
            "session_id": str(snapshot["session_id"]),
            "session_name": str(snapshot["session_name"]),
            "window_id": str(snapshot["window_id"]),
            "pane_id": str(snapshot["pane_id"]),
            "pane_pid": str(snapshot["pane_pid"]),
            "original_path": str(snapshot["original_path"]),
            "current_path": str(snapshot["current_path"]),
            "original_command": str(snapshot["original_command"]),
            "current_command": str(snapshot["current_command"]),
            "replace_policy": replace_policy,
        }
        uri = (
            "tmux://pane/" + quote(str(snapshot["pane_id"]), safe="%")
            + "?socket_path=" + quote(str(snapshot["socket_path"]), safe="")
            + "&server_pid=" + str(snapshot["server_pid"])
            + "&session_id=" + quote(str(snapshot["session_id"]), safe="")
            + "&session_name=" + quote(str(snapshot["session_name"]), safe="")
            + "&window_id=" + quote(str(snapshot["window_id"]), safe="")
            + "&pane_id=" + quote(str(snapshot["pane_id"]), safe="%")
        )
        return Ref(RefType.SESSION, self.provider_id, digest, uri=uri, metadata=metadata)

    def native_ref(self, console: TmuxConsoleV1) -> Ref:
        """Return the actual native identity created after Binding freeze."""
        return Ref(
            RefType.SESSION,
            self.provider_id,
            console.session_id,
            uri=f"tmux://{console.socket_name}/{console.session_name}",
            metadata={
                "session_name": console.session_name,
                "socket_name": console.socket_name,
                "spec_digest": console.spec_digest,
            },
        )

    @staticmethod
    def pane_identity_digest(pane: TmuxPaneV1) -> str:
        identity = {
            "socket_path": str(pane.socket_path),
            "server_pid": pane.server_pid,
            "session_id": pane.session_id,
            "window_id": pane.window_id,
            "pane_id": pane.pane_id,
        }
        return "sha256:" + hashlib.sha256(
            json.dumps(identity, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()

    def send_command(self, console: TmuxConsoleV1, pane_id: str, command: str) -> None:
        if pane_id not in console.pane_ids:
            raise ValueError(f"pane does not belong to console: {pane_id}")
        self._run("-L", console.socket_name, "send-keys", "-t", pane_id, command, "Enter")

    def cleanup(self, console: TmuxConsoleV1 | TmuxPaneV1) -> None:
        if isinstance(console, TmuxPaneV1):
            from .control import TmuxConsoleController

            TmuxConsoleController().cleanup(console)
            return
        self._run("-L", console.socket_name, "kill-session", "-t", console.session_name)

    def _call_socket(self, socket_path: Path | None, *args: str) -> subprocess.CompletedProcess[str]:
        command = [str(self.binary)]
        if socket_path is not None:
            command.extend(("-S", str(socket_path)))
        command.extend(args)
        return subprocess.run(
            command,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

    def _call(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(self.binary), *args],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

    def _run(self, *args: str) -> str:
        completed = self._call(*args)
        if completed.returncode != 0:
            detail = completed.stderr.strip() or completed.stdout.strip()
            raise RuntimeError(f"tmux command failed: {detail}")
        return completed.stdout.strip()
