"""Turn-Binding reference scan for the harness config deletion guard.

Freezes the deletion invariant of the harness model provider authority:
*deletion is rejected while any turn Binding's ``model_provider_ref``
names one of the config's revisions, unless an explicit live
``replacement_config_id`` is named.*

The official Session Store SPI has no turn enumeration, but turn rows ARE
reachable through its public API: every turn durably appends ledger
events carrying its ``turn_id`` (``transcript``), and each turn row (with
its frozen ``BindingSnapshot``) is readable via ``get_turn``.  This scan
therefore stays fully on the public store API:

1. ``list_sessions()`` (bounded to the first 128 sessions);
2. per session, ``transcript(session_id)`` -> distinct ``turn_id`` values
   (bounded to the first 256 turns per session);
3. per turn, ``get_turn(session_id, turn_id)`` -> ``binding``;
4. referenced := ``binding.model_provider_ref`` is a Ref owned by the
   ``harness-model-providers`` provider whose native id is
   ``<config_id>/revisions/<n>`` (any revision counts — deleting the
   config destroys all its revisions).

The scan reads ONLY ``binding.model_provider_ref`` — the formal Binding
authority — and NEVER ``binding.extra`` (the legacy P2-era extras keys are
deliberately ignored).  Per-session/per-turn read errors are skipped (a
mid-saga turn row must not break the scan); a store that cannot list
sessions at all fails closed with a typed error so a destructive delete
can never proceed on an unreadable reference surface.  The result is
bounded (max 32 entries) and carries identity facts only.
"""
from __future__ import annotations

from typing import Any

from .errors import ProviderAuthorityError
from .validation import PROVIDER_ID

MAX_SESSIONS_SCANNED = 128
MAX_TURNS_PER_SESSION = 256
MAX_REFERENCES = 32


def _ref_matches(binding_ref: Any, config_id: str) -> bool:
    if binding_ref is None:
        return False
    provider = getattr(binding_ref, "provider", None)
    native_id = getattr(binding_ref, "native_id", None)
    if not isinstance(provider, str) or not isinstance(native_id, str):
        return False
    if provider != PROVIDER_ID:
        return False
    prefix = f"{config_id}/revisions/"
    return native_id.startswith(prefix) and native_id[len(prefix):].isdigit()


def find_config_references(
    session_store: Any, config_id: str
) -> list[dict[str, str]]:
    """Bounded scan of turn Bindings referencing one harness config.

    Returns a bounded list of ``{session_id, turn_id}`` identity facts
    (empty = unreferenced) or raises a typed error when the reference
    surface is unreadable (fail closed).
    """
    try:
        sessions = list(session_store.list_sessions())
    except Exception:
        raise ProviderAuthorityError(
            503,
            "CONFIG_REFERENCE_SCAN_UNAVAILABLE",
            "config reference scan is unavailable; deletion is refused",
        )
    references: list[dict[str, str]] = []
    for session in sessions[:MAX_SESSIONS_SCANNED]:
        session_id = getattr(session, "session_id", None)
        if not session_id:
            continue
        try:
            events = session_store.transcript(session_id)
        except Exception:
            continue
        turn_ids: list[str] = []
        seen: set[str] = set()
        for event in events:
            turn_id = getattr(event, "turn_id", None)
            if turn_id and turn_id not in seen:
                seen.add(turn_id)
                turn_ids.append(turn_id)
            if len(turn_ids) >= MAX_TURNS_PER_SESSION:
                break
        for turn_id in turn_ids:
            try:
                turn = session_store.get_turn(session_id, turn_id)
            except Exception:
                continue
            binding = getattr(turn, "binding", None)
            if binding is None:
                continue
            # ONLY the formal Binding authority: binding.model_provider_ref.
            if _ref_matches(getattr(binding, "model_provider_ref", None), config_id):
                references.append({"session_id": session_id, "turn_id": turn_id})
                if len(references) >= MAX_REFERENCES:
                    return references
    return references
