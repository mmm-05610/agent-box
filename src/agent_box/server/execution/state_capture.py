"""The state-capture rules, independent of which channel supplies the listing.

Both channels (a Worker-hosted one and a local one) capture the same declared
writable subtree under the same rules: the bound checks, the protected
read-only paths, the attempt-ephemeral prefixes, the credential scan, and the
"two identical consecutive snapshots" settle loop. Only two things differ - how
the subtree is listed, and how one file is read - so they are parameters here
rather than a second copy of the rules.
"""
from __future__ import annotations

import time
from typing import Any, Callable, Mapping, Sequence

#: One state file may not exceed this many bytes.
MAX_STATE_FILE_BYTES = 8 * 1024 * 1024
#: One state projection may not exceed this many files, nor this many bytes.
MAX_STATE_FILES = 256
MAX_STATE_TOTAL_BYTES = 8 * 1024 * 1024
#: How long a capture waits for the subtree to stop changing, and how often it looks.
STATE_SETTLE_DEADLINE_SECONDS = 20.0
STATE_SETTLE_INTERVAL_SECONDS = 0.2

Listing = Sequence[Mapping[str, Any]]
Read = Callable[[str], tuple[bytes, str]]


class StateCaptureError(RuntimeError):
    """A typed refusal from the capture rules; ``code`` names the boundary."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _matches_ephemeral_prefix(relative: str, prefixes: Sequence[str]) -> bool:
    return any(relative == prefix or relative.startswith(prefix + "/") for prefix in prefixes)


def _safe_relative_state_path(value: str) -> str:
    if (not isinstance(value, str) or not value or value.startswith("/") or "\\" in value
            or "\x00" in value or "//" in value
            or any(part in {"", ".", ".."} for part in value.split("/"))):
        raise StateCaptureError("SIDECAR_STATE_PATH_INVALID", "state path is not a bounded relative path")
    return value


def state_snapshot(
    listing: Listing, read: Read, *,
    state_bundle_prefix: str,
    protected_state_paths: Sequence[str] = (),
    state_ephemeral_paths: Sequence[str] = (),
    forbidden_content: bytes = b"",
) -> tuple[dict[str, tuple[int, str]], dict[str, bytes]]:
    """List the declared state subtree and read it, within every bound.

    Returns the content identity of what was read plus the bytes themselves.
    Bound violations and credential material are typed failures; a file that
    changes while it is being read surfaces as an identity conflict. Both mean
    "not settled yet" to the settle loop, which is the only place that decides
    to wait - a special file, a traversal or file-count overflow, or a plain
    fault is reported straight through.
    """
    if state_bundle_prefix is None:
        return {}, {}
    protected = frozenset(protected_state_paths)
    prefix = state_bundle_prefix + "/"
    selected: list[tuple[str, str, int]] = []
    total = 0
    for item in listing:
        path = item.get("path")
        size = item.get("size")
        if not isinstance(path, str) or not path.startswith(prefix):
            continue
        relative = path[len(prefix):]
        if relative == ".agentbox-state":
            continue
        _safe_relative_state_path(relative)
        if relative in protected:
            # Declared read-only configuration, not captured state.
            continue
        if _matches_ephemeral_prefix(relative, state_ephemeral_paths):
            # Attempt-ephemeral scratch is shadowed by a tmpfs inside the
            # sandbox; should a file ever appear here on the view side (e.g.
            # restored by an older generation), it is not state.
            continue
        if not isinstance(size, int) or size < 0 or size > MAX_STATE_FILE_BYTES:
            raise StateCaptureError("SIDECAR_STATE_OUTSIDE_BOUNDS", "state file exceeds bound")
        total += size
        if len(selected) >= MAX_STATE_FILES or total > MAX_STATE_TOTAL_BYTES:
            raise StateCaptureError("SIDECAR_STATE_OUTSIDE_BOUNDS", "state projection exceeds bound")
        selected.append((path, relative, size))

    contents: dict[str, bytes] = {}
    identity: dict[str, tuple[int, str]] = {}
    for path, relative, size in selected:
        content, digest_value = read(path)
        if len(content) != size:
            raise StateCaptureError(
                "SIDECAR_STATE_IDENTITY_CONFLICT", "state size changed during capture",
            )
        if forbidden_content and forbidden_content in content:
            # The path is diagnostics and names the file to investigate; the
            # message never carries the matched material itself.
            raise StateCaptureError(
                "SIDECAR_STATE_CONTAINS_SECRET",
                f"credential material found in native state: {relative}",
            )
        contents[relative] = content
        identity[relative] = (size, digest_value)
    return identity, contents


def settled_state(
    snapshot: Callable[[], tuple[dict[str, tuple[int, str]], dict[str, bytes]]], *,
    is_transient: Callable[[BaseException], bool],
    deadline_seconds: float | None = None,
    interval_seconds: float | None = None,
) -> dict[str, bytes]:
    """Wait, bounded, until the state subtree stops changing, then return it.

    A native Harness may still be finishing its own writes right after `close` -
    appending transcripts, removing the short-lived alias links it created - so
    the first snapshots can differ. Two identical consecutive snapshots mean it
    stopped, and only then are those bytes returned; a subtree that never stops
    changing fails rather than producing a checkpoint that mixes two moments.
    """
    deadline = time.monotonic() + (
        STATE_SETTLE_DEADLINE_SECONDS if deadline_seconds is None else deadline_seconds
    )
    pause = STATE_SETTLE_INTERVAL_SECONDS if interval_seconds is None else interval_seconds
    previous: dict[str, tuple[int, str]] | None = None
    while True:
        try:
            identity, contents = snapshot()
        except BaseException as error:  # noqa: BLE001 - classified, not swallowed
            if not is_transient(error):
                raise
            identity, contents = None, None
        if identity is not None and previous is not None and identity == previous:
            return contents
        previous = identity
        if time.monotonic() >= deadline:
            raise StateCaptureError(
                "SIDECAR_STATE_NOT_SETTLED",
                "the native state subtree did not stop changing before the deadline",
            )
        time.sleep(pause)


def merge_state_into_bundle(
    bundle: dict[str, bytes], *,
    state_bundle_prefix: str | None, state_target: str | None,
    restored_state: Mapping[str, bytes] | None = None,
    protected_state_paths: Sequence[str] = (),
    state_ephemeral_paths: Sequence[str] = (),
) -> None:
    """Put the declared state projection into a bundle, in place.

    The marker makes the mounted state directory exist even for a first turn,
    and the restored checkpoint's files land under it - except the read-only
    configuration the deployment owns (refused, never silently dropped) and the
    attempt-ephemeral scratch an older checkpoint may still carry (dropped, as
    the capture drops live files under the same prefix).
    """
    if state_ephemeral_paths and state_target is None:
        raise StateCaptureError("SIDECAR_STATE_EPHEMERAL_WITHOUT_STATE", "ephemeral state without a state target")
    if (state_bundle_prefix is None) != (state_target is None):
        raise StateCaptureError("SIDECAR_STATE_PROJECTION_INVALID", "state projection is incomplete")
    if protected_state_paths and state_bundle_prefix is None:
        raise StateCaptureError("SIDECAR_STATE_PROJECTION_INVALID", "protected paths without a state projection")
    if state_bundle_prefix is None:
        return
    _safe_relative_state_path(state_bundle_prefix)
    marker_path = f"{state_bundle_prefix}/.agentbox-state"
    if marker_path in bundle:
        raise StateCaptureError("SIDECAR_STATE_PATH_CONFLICT", "state marker already present")
    bundle[marker_path] = b"state-v1\n"
    protected = frozenset(protected_state_paths)
    for relative, content in (restored_state or {}).items():
        _safe_relative_state_path(relative)
        if relative in protected:
            raise StateCaptureError("SIDECAR_STATE_PROTECTED_PATH", "checkpoint carries a protected path")
        if _matches_ephemeral_prefix(relative, state_ephemeral_paths):
            continue
        bundle_path = f"{state_bundle_prefix}/{relative}"
        if bundle_path in bundle:
            raise StateCaptureError("SIDECAR_STATE_PATH_CONFLICT", "checkpoint collides with the bundle")
        bundle[bundle_path] = bytes(content)
    if len(bundle) > MAX_STATE_FILES * 4 or sum(map(len, bundle.values())) > MAX_STATE_TOTAL_BYTES * 8:
        raise StateCaptureError("SIDECAR_BUNDLE_OUTSIDE_WORKER_BOUNDS", "bundle exceeds its bounds")
