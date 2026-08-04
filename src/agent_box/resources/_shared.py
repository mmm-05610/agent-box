"""Shared helpers for resources/ modules.

Every apply function in the project follows the same preamble:
  1. load profile metadata
  2. resolve the agent-type registry entry
  3. fetch the resource from ACS

These two functions DRY that boilerplate so that each apply.py only
contains the actual per-type write/merge logic.
"""
from __future__ import annotations

from typing import Any, Callable, Dict

from ..core.library import get_agent_config
from .profile import ProfileError, load_meta


def resolve_profile(profile_name: str) -> tuple[Dict[str, str], Dict[str, Any]]:
    """Return ``(meta, agent_config)`` for *profile_name*.

    Raises :class:`ProfileError` if the profile or its agent type is
    unknown.
    """
    meta = load_meta(profile_name)
    agent_config = get_agent_config(meta["agent_type"])
    if agent_config is None:
        raise ProfileError(
            f"unknown agent_type {meta['agent_type']!r} for profile {profile_name!r}"
        )
    return meta, agent_config


def fetch_from_acs(
    profile_name: str,
    resource_id: str,
    fetcher: Callable[..., Any],
    *,
    label: str = "resource",
) -> tuple[Dict[str, str], Any]:
    """Fetch *resource_id* from ACS via *fetcher*.

    *fetcher* is called with ``(agent_type, resource_id)``.  Returns
    ``(meta, resource)`` so the caller has both the profile metadata
    and the fetched object.

    Raises :class:`ProfileError` on lookup failure.
    """
    meta, _ = resolve_profile(profile_name)
    resource = fetcher(meta["agent_type"], resource_id)
    if resource is None:
        raise ProfileError(
            f"{label} {resource_id!r} not found in ACS "
            f"for {meta['agent_type']!r}"
        )
    return meta, resource
