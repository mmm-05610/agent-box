"""Bounded execution transport from Windows to one WSL Worker attempt."""
from __future__ import annotations

import base64
from dataclasses import dataclass, field
import hashlib
import queue
from typing import Any, Callable, Mapping, Sequence

from .client import WorkerClient
from .connector import WslConnector


TRANSFER_CHUNK = 32 * 1024
INTERACTIVE_EVENT_CHUNK_BYTES = 32 * 1024


@dataclass
class WslAttempt:
    client: WorkerClient
    attempt_id: str
    generation: int
    view_id: str
    secret_frame_id: str
    terminal: Mapping[str, Any] | None = None
    interactive: bool = False
    _outputs: "queue.Queue[Mapping[str, Any]]" = field(default_factory=queue.Queue)

    def subscribe_output(self, listener: Callable[[Mapping[str, Any]], None]) -> Callable[[], None]:
        """Forward pre-terminal process.output events to the listener."""
        if not self.interactive:
            raise RuntimeError("ATTEMPT_NOT_INTERACTIVE")

        def _dispatch(event: Mapping[str, Any]) -> None:
            listener(event.get("result") or {})

        return self.client.subscribe_output(_dispatch)

    def next_output(self, timeout: float | None = None):
        """Pop the oldest buffered pre-terminal output event, or None."""
        try:
            return self._outputs.get(timeout=timeout) if timeout is not None else self._outputs.get_nowait()
        except queue.Empty:
            return None

    def write_stdin(self, data: bytes, *, timeout: float = 10.0) -> int:
        if not self.interactive:
            raise RuntimeError("ATTEMPT_NOT_INTERACTIVE")
        return self.client.write_stdin(self.attempt_id, self.generation, data, timeout=timeout)

    def close_stdin(self, *, timeout: float = 10.0) -> None:
        if not self.interactive:
            raise RuntimeError("ATTEMPT_NOT_INTERACTIVE")
        self.client.close_stdin(self.attempt_id, self.generation, timeout=timeout)


class WslExecutionTransport:
    def __init__(self, connector: WslConnector, *, codex_linux_path: str, codex_digest: str) -> None:
        if not codex_linux_path.startswith("/"):
            raise ValueError("CODEX_EXECUTABLE_PATH_INVALID")
        if not codex_digest.startswith("sha256:") or len(codex_digest) != 71:
            raise ValueError("CODEX_EXECUTABLE_DIGEST_INVALID")
        self.connector = connector
        self.codex_linux_path = codex_linux_path
        self.codex_digest = codex_digest

    def start(
        self, *, workspace: Mapping[str, Any], attempt_id: str, generation: int,
        plan: Any, credential: bytes, restored_files: Mapping[str, bytes],
        room_command: Callable[[str, str], Sequence[str]],
        secret_frame_id: str = "credential",
        projected_files: Mapping[str, bytes] | None = None,
        interactive: bool = False,
    ) -> WslAttempt:
        """Stage the bytes and run one command, without knowing what it is.

        ``room_command`` is the sandbox layer's product, asked for once the
        bindings exist: it receives the staged home path and the secret's host
        location and returns the argv to run. This transport never composes an
        isolation command, never spells a guest path, and never names a
        Harness credential shape.
        """
        client = self.connector.client_for_workspace(
            distribution=workspace["distribution"], user=workspace["remote_user"],
            connection_id=workspace["connection_id"], workspace_path=workspace["remote_path"],
            executable_authorizations=(
                {"path": self.codex_linux_path, "digest": self.codex_digest},
            ),
        )
        view_id = f"view-{attempt_id}"
        client.start()
        try:
            files = dict(restored_files)
            for path, content in (projected_files or {}).items():
                if path in files and files[path] != content:
                    raise ValueError("CODEX_PROJECTED_FILE_CONFLICT")
                files[path] = content
            manifest = [
                {"path": path, "size": len(content), "digest": _digest(content)}
                for path, content in sorted(files.items())
            ]
            client.request("view.prepare", {"viewId": view_id, "files": manifest})
            for path, content in sorted(files.items()):
                for offset in range(0, len(content), TRANSFER_CHUNK):
                    client.request("view.put", {
                        "viewId": view_id, "path": path, "offset": offset,
                        "data": base64.b64encode(content[offset:offset + TRANSFER_CHUNK]).decode(),
                    })
            home = client.request("view.commit", {"viewId": view_id})["path"]
            secret = client.request("secret.put", {
                "attemptId": attempt_id, "frameId": secret_frame_id,
                "data": base64.b64encode(credential).decode(),
            })["path"]
            argv = list(room_command(home, secret))
            client.request(
                "spawn",
                {"argv": argv, "timeoutMs": int(plan.timeout_ms),
                 "stdinBase64": base64.b64encode(plan.stdin).decode(),
                 **({"interactive": True} if interactive else {})},
                attempt_id=attempt_id, generation=generation,
            )
            attempt = WslAttempt(
                client, attempt_id, generation, view_id, secret_frame_id,
                interactive=interactive,
            )
            if interactive:
                attempt.subscribe_output(attempt._outputs.put)
            return attempt
        except BaseException:
            self._best_effort_pre_result_cleanup(client, attempt_id, view_id, secret_frame_id)
            client.close()
            raise

    def wait(self, attempt: WslAttempt, *, timeout: float = 125) -> Mapping[str, Any]:
        attempt.terminal = attempt.client.wait_terminal(
            attempt.attempt_id, attempt.generation, timeout=timeout,
        )
        return attempt.terminal

    def result_bytes(self, attempt: WslAttempt, artifact: str) -> tuple[bytes, str]:
        return self._fetch(attempt, "result.get", artifact=artifact)

    def list_view(self, attempt: WslAttempt) -> tuple[Mapping[str, Any], ...]:
        value = attempt.client.request("view.list", {"viewId": attempt.view_id})
        return tuple(value["files"])

    def view_bytes(self, attempt: WslAttempt, path: str) -> tuple[bytes, str]:
        return self._fetch(attempt, "view.get", path=path)

    def _fetch(self, attempt: WslAttempt, op: str, **identity: str) -> tuple[bytes, str]:
        chunks = bytearray()
        expected = None
        while True:
            arguments = {**identity, "offset": len(chunks), "maxLength": TRANSFER_CHUNK}
            if op == "view.get":
                arguments["viewId"] = attempt.view_id
                item = attempt.client.request(op, arguments)
            else:
                item = attempt.client.request(
                    op, arguments, attempt_id=attempt.attempt_id,
                    generation=attempt.generation,
                )
            expected = expected or item["digest"]
            if item["digest"] != expected or item["offset"] != len(chunks):
                raise RuntimeError("WORKER_FETCH_IDENTITY_CONFLICT")
            chunks.extend(base64.b64decode(item["data"], validate=True))
            if item["eof"]:
                break
        content = bytes(chunks)
        if _digest(content) != expected:
            raise RuntimeError("WORKER_FETCH_DIGEST_MISMATCH")
        return content, expected

    def cancel(self, attempt: WslAttempt) -> bool:
        return bool(attempt.client.request(
            "cancel", attempt_id=attempt.attempt_id, generation=attempt.generation,
        )["accepted"])

    def acknowledge_and_cleanup(self, attempt: WslAttempt) -> None:
        failure = None
        operations = (
            ("result.ack", {}, True),
            ("secret.cleanup", {
                "attemptId": attempt.attempt_id, "frameId": attempt.secret_frame_id,
            }, False),
            ("view.cleanup", {"viewId": attempt.view_id}, False),
            ("attempt.cleanup", {}, True),
        )
        try:
            for op, arguments, identified in operations:
                try:
                    if identified:
                        attempt.client.request(
                            op, arguments, attempt_id=attempt.attempt_id,
                            generation=attempt.generation,
                        )
                    else:
                        attempt.client.request(op, arguments)
                except BaseException as exc:
                    failure = failure or exc
        finally:
            attempt.client.close()
        if failure is not None:
            raise failure

    def abandon(self, attempt: WslAttempt) -> None:
        """Revoke secret access and disconnect without acknowledging results."""
        try:
            attempt.client.request("secret.cleanup", {
                "attemptId": attempt.attempt_id, "frameId": attempt.secret_frame_id,
            }, timeout=2)
        except BaseException:
            pass
        finally:
            attempt.client.close()

    @staticmethod
    def _best_effort_pre_result_cleanup(client, attempt_id, view_id, frame_id) -> None:
        for op, arguments in (
            ("secret.cleanup", {"attemptId": attempt_id, "frameId": frame_id}),
            ("view.cleanup", {"viewId": view_id}),
        ):
            try:
                client.request(op, arguments, timeout=2)
            except BaseException:
                pass


def _digest(content: bytes) -> str:
    return "sha256:" + hashlib.sha256(content).hexdigest()
