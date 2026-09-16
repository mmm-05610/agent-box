"""Which machine runs this turn, and therefore which channel carries it.

The workspace record already says where a turn belongs (`env_kind`: local, wsl,
or ssh). This module turns that fact into the one decision the product may make
from it - which channel implementation stages the bytes and starts the process -
and refuses, in typed terms, when no implementation can serve the placement.

It deliberately decides nothing else: the room is the sandbox layer's product and
the command is the deployment's. Swapping the placement swaps the channel, not
the execution.
"""
from __future__ import annotations

from dataclasses import dataclass

#: The channel implementations that exist today.
LOCAL_CHANNEL = "local-process"
WSL_CHANNEL = "wsl-worker"

#: Placements the product knows the name of but has no implementation for.
UNIMPLEMENTED_PLACEMENTS = frozenset({"ssh"})


class PlacementUnsupported(RuntimeError):
    """No channel implementation can serve this placement."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


@dataclass(frozen=True)
class Placement:
    """One resolved placement: where the turn runs, and which channel carries it."""

    kind: str
    channel: str


def resolve_placement(kind: str | None, *, has_connector: bool) -> Placement:
    """Resolve the workspace's placement into a channel implementation.

    ``has_connector`` is whether a WSL connector exists in this composition: a
    deployment that declares a WSL workspace but composes no connector is refused
    here, with the same typed code the launcher used to raise, so the reason
    survives into durable state.
    """
    if kind == "wsl":
        if not has_connector:
            raise PlacementUnsupported(
                "WSL_CONNECTOR_UNAVAILABLE", "a WSL workspace needs a composed connector",
            )
        return Placement(kind="wsl", channel=WSL_CHANNEL)
    if kind == "local":
        return Placement(kind="local", channel=LOCAL_CHANNEL)
    if kind in UNIMPLEMENTED_PLACEMENTS:
        # Named, refused, and never silently downgraded to another machine: the
        # workspace record says where the work belongs.
        raise PlacementUnsupported(
            "PLACEMENT_UNIMPLEMENTED", f"no channel implementation for the {kind!r} placement",
        )
    raise PlacementUnsupported(
        "PLACEMENT_UNKNOWN", f"the workspace names no supported placement: {kind!r}",
    )
