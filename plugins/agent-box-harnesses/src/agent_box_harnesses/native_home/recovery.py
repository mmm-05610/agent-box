"""Deterministic rollback / recovery for unified Profile transactions.

Recovery NEVER guesses from the last journal step.  The decision is derived
from the journal's commit INTENT (previous pointer snapshot, proposed
pointer snapshot, revision intent, receipts digests, applied files) plus the
ACTUAL durable observations (current pointer, revision envelope, receipt
store) via a fixed truth table:

    pointer intent declared, actual pointer:
        actual == proposed -> verify complete committed state
            verified                -> COMPLETE_COMMIT (journal closed COMMITTED)
            fresh profile (no previous) + envelope proves the transaction
                                    -> ROLLBACK_TO_PREVIOUS (safely remove)
            otherwise               -> RECOVERY_REQUIRED
        actual == previous          -> ROLLBACK_TO_PREVIOUS (clean unstaged)
        actual missing, previous empty (fresh) -> ROLLBACK_TO_PREVIOUS
        actual missing, previous set -> RECOVERY_REQUIRED
        actual != previous and != proposed, or corrupt -> RECOVERY_REQUIRED

    pointer intent not declared (pointer should never have moved):
        actual missing + previous empty -> ROLLBACK_TO_PREVIOUS
        actual == previous (or missing with previous empty) -> ROLLBACK_TO_PREVIOUS
        anything else (incl. corrupt pointer) -> RECOVERY_REQUIRED

Committed verification is operation-aware:
  * revision operations (config/skill/legacy/migration): the envelope at the
    pointer's revision exists, its CANONICAL digest (recomputed, never the
    self-reported field) equals the pointer digest, envelope identity
    (harness_type/profile_id/provider_id/revision/digest) matches, and — for
    skill operations — the receipt store digest equals receipts_digest_after.
  * reconcile: the pointer replacement itself is the commit (single-file
    atomic); actual == proposed with matching revision/digest/generation/
    native_tree_digest IS the verified commit.

"A corrupted pointer is never treated as missing": every helper below
distinguishes missing / corrupt / valid and only the explicit missing +
fresh case ever rolls forward.
"""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from .failures import (
    PROFILE_POINTER_INVALID,
    PROFILE_POINTER_NOT_FOUND,
    PROFILE_TRANSACTION_INCOMPLETE,
    ProfileNativeHomeError,
)
from .layout import ProfileLayout
from .receipts import ReceiptStore
from .durable import DurabilityError, atomic_write_durable, durable_copy, remove_durable, remove_tree_durable
from .policy import policy_for
from .tree import digest_tree
from .transaction import (
    RECEIPT_OPS,
    REVISION_OPS,
    TERMINAL,
    pending_journals,
    valid_terminal_transition,
    valid_transition,
    write_journal,
)

RestoreExtra = Callable[[ProfileLayout, Mapping[str, Any], Path], None]

COMPLETE_COMMIT = "COMPLETE_COMMIT"
ROLLBACK_TO_PREVIOUS = "ROLLBACK_TO_PREVIOUS"
RECOVERY_REQUIRED = "RECOVERY_REQUIRED"


class RecoveryError(ProfileNativeHomeError):
    pass


def _pointer_path(layout: ProfileLayout) -> Path:
    return layout.profile_json


def _timestamp() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


# ------------------------------------------------------------------------- #
# pointer observations (missing / corrupt / valid — never conflated)
# ------------------------------------------------------------------------- #
class PointerObservation:
    __slots__ = ("status", "pointer")

    def __init__(self, status: str, pointer: Mapping[str, Any] | None = None) -> None:
        self.status = status  # "missing" | "corrupt" | "valid"
        self.pointer = pointer

    @property
    def valid(self) -> bool:
        return self.status == "valid"


def observe_pointer(layout: ProfileLayout) -> PointerObservation:
    """Classify the ACTUAL current pointer; corrupt is never 'missing'."""
    path = _pointer_path(layout)
    if not path.is_file():
        return PointerObservation("missing")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return PointerObservation("corrupt")
    if not isinstance(raw, dict) or not isinstance(raw.get("revision"), int) or int(raw.get("revision", 0)) < 1:
        return PointerObservation("corrupt")
    if not isinstance(raw.get("digest"), str) or not raw["digest"].startswith("sha256:"):
        return PointerObservation("corrupt")
    return PointerObservation("valid", raw)


def read_pointer_strict(layout: ProfileLayout) -> Mapping[str, Any]:
    observation = observe_pointer(layout)
    if observation.status == "missing":
        raise ProfileNativeHomeError(PROFILE_POINTER_NOT_FOUND, layout.profile_id)
    if observation.status != "valid":
        raise ProfileNativeHomeError(PROFILE_POINTER_INVALID, layout.profile_id)
    return observation.pointer


def _write_pointer(layout: ProfileLayout, pointer: Mapping[str, Any]) -> None:
    from .durable import _record

    raw = (json.dumps(pointer, sort_keys=True, separators=(",", ":")) + "\n").encode()
    _record(f"pointer:replace:{layout.profile_id}")
    atomic_write_durable(_pointer_path(layout), raw)


# ------------------------------------------------------------------------- #
# complete-commit verification (operation-aware, canonical digest)
# ------------------------------------------------------------------------- #
def recompute_envelope_digest(envelope: Mapping[str, Any]) -> str:
    """Canonical re-computation of an envelope's identity digest.

    Never trusts the self-reported digest field; mirrors the store's
    identity digest (excluding the mutable pointer-only fields).
    """
    import hashlib

    _NON_IDENTITY = frozenset({"digest", "revision", "native_state_generation", "native_tree_digest", "recovery_generation"})
    body = {key: value for key, value in envelope.items() if key not in _NON_IDENTITY}
    return "sha256:" + hashlib.sha256(
        json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def _verify_revision_commit(layout: ProfileLayout, journal: Mapping[str, Any], pointer: Mapping[str, Any]) -> bool:
    """Revision-operation verification: envelope canonical digest + identity."""
    revision = pointer.get("revision")
    envelope_path = layout.revision_dir(int(revision)) / "envelope.json"
    if not envelope_path.is_file() or envelope_path.is_symlink():
        return False
    try:
        envelope = json.loads(envelope_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    if not isinstance(envelope, dict):
        return False
    if str(envelope.get("harness_type", "")) != layout.harness_type:
        return False
    if str(envelope.get("profile_id", "")) != layout.profile_id:
        return False
    if str(envelope.get("provider_id", "")) != str(pointer.get("provider_id", "")):
        return False
    if int(envelope.get("revision", -1)) != int(revision):
        return False
    if str(envelope.get("digest", "")) != str(pointer.get("digest", "")):
        return False
    if recompute_envelope_digest(envelope) != str(pointer.get("digest", "")):
        return False
    expected_tree = str(pointer.get("native_tree_digest", ""))
    if expected_tree and digest_tree(policy_for(layout.harness_type), layout.native_home) != expected_tree:
        return False
    return True


def verify_committed(layout: ProfileLayout, journal: Mapping[str, Any], *, receipts_digest: str | None = None) -> bool:
    """True ONLY when the journaled mutation is provably committed.

    The pointer replacement is the single visibility commit point: actual
    pointer must equal the PROPOSED pointer (full snapshot) AND — for
    revision operations — the envelope must satisfy canonical-digest +
    identity verification; for skill operations the receipt store must
    match ``receipts_digest_after``.
    """
    if not journal.get("pointer_intent_declared"):
        return False
    proposed = journal.get("proposed_pointer")
    if not isinstance(proposed, dict) or not proposed:
        return False
    observation = observe_pointer(layout)
    if observation.status != "valid":
        return False
    actual = observation.pointer
    if dict(actual) != dict(proposed):
        return False
    operation = str(journal.get("operation", ""))
    if operation in REVISION_OPS:
        if not _verify_revision_commit(layout, journal, actual):
            return False
    if operation in RECEIPT_OPS:
        recorded_after = str(journal.get("receipts_digest_after", ""))
        if recorded_after:
            if receipts_digest is None:
                receipts_digest = ReceiptStore(layout).digest()
            if receipts_digest != recorded_after:
                return False
    return True


# ------------------------------------------------------------------------- #
# rollback (deterministic replay of intent + facts)
# ------------------------------------------------------------------------- #
def _restore_native_backup(layout: ProfileLayout, backup_dir: Path, staged_dir: Path | None = None, applied_files: Sequence[str] = ()) -> None:
    manifest = tuple(applied_files)
    if not manifest and staged_dir is not None and staged_dir.is_dir():
        manifest = tuple(
            item.relative_to(staged_dir).as_posix()
            for item in sorted(staged_dir.rglob("*"))
            if item.is_file() and not item.is_symlink()
        )
    for relative in manifest:
        target = (layout.native_home / relative).resolve()
        if layout.native_home not in target.parents:
            raise RecoveryError("BACKUP_PATH_ESCAPE", relative[:128])
        backup = backup_dir / relative
        if backup.is_file() and not backup.is_symlink():
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            durable_copy(backup, target)
        else:
            if not target.exists():
                continue
            if staged_dir is None or not staged_dir.is_dir():
                raise RecoveryError("RESTORE_MANIFEST_UNVERIFIABLE", relative[:128])
            staged_copy = staged_dir / relative
            if not staged_copy.is_file() or staged_copy.is_symlink():
                raise RecoveryError("RESTORE_MANIFEST_UNVERIFIABLE", relative[:128])
            if staged_copy.read_bytes() != target.read_bytes():
                raise RecoveryError("RESTORE_MANIFEST_UNVERIFIABLE", relative[:128])
            try:
                remove_durable(target)
            except OSError as exc:
                raise RecoveryError("RESTORE_UNLINK_FAILED", relative[:128]) from exc
    if backup_dir.is_dir():
        for item in sorted(backup_dir.rglob("*")):
            if item.is_dir() or item.is_symlink():
                continue
            relative = item.relative_to(backup_dir).as_posix()
            target = (layout.native_home / relative).resolve()
            if layout.native_home not in target.parents:
                raise RecoveryError("BACKUP_PATH_ESCAPE", relative[:128])
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            durable_copy(item, target)
    for item in sorted(layout.native_home.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if item.is_dir() and not any(item.iterdir()):
            try:
                item.rmdir()
            except OSError:
                pass


def _remove_revision_dir(layout: ProfileLayout, revision: int) -> None:
    revision_dir = layout.revision_dir(revision)
    if not revision_dir.exists():
        return
    envelope = revision_dir / "envelope.json"
    try:
        value = json.loads(envelope.read_text(encoding="utf-8"))
        recorded = int(value.get("revision", -1))
    except (OSError, ValueError):
        recorded = -1
    if recorded != revision:
        raise RecoveryError("REVISION_MISMATCH", f"r{revision}")
    remove_tree_durable(revision_dir)


def rollback_transaction(layout: ProfileLayout, journal: Mapping[str, Any], *, restore_extra: RestoreExtra | None = None) -> None:
    """Rewind one journaled mutation to its previous state (idempotent).

    Only ever called when the decision is ROLLBACK_TO_PREVIOUS (see
    ``decide_recovery``): the actual pointer is previous/missing-fresh, so
    restoring the full previous pointer snapshot (or removing the fresh
    pointer) is exact, then the revision dir, the native files (backup +
    staged replay, unverifiable files fail closed) and the operation extra
    (receipts) are rewound.  Any failure marks RECOVERY_REQUIRED and never
    reports success on a partial rewind.
    """
    steps = journal.get("steps", ())
    txid = str(journal["txid"])
    directory = layout.transactions / txid
    try:
        previous = journal.get("previous_pointer")
        observation = observe_pointer(layout)
        if previous:
            _write_pointer(layout, previous)
        else:
            # fresh profile: rollback removes the pointer the transaction
            # provably wrote (the decision layer verified actual == proposed
            # or actual is missing) — no 'PREVIOUS_POINTER_MISSING' trap
            if observation.status != "missing":
                if observation.status != "valid" or dict(observation.pointer) != dict(journal.get("proposed_pointer", {})):
                    raise RecoveryError("FRESH_POINTER_UNVERIFIABLE", txid)
                try:
                    remove_durable(_pointer_path(layout))
                except DurabilityError:
                    raise RecoveryError("FRESH_POINTER_REMOVE_FAILED", txid)
        recorded_revision = journal.get("revision_written")
        if "REVISION_WRITTEN" in steps and recorded_revision is not None:
            _remove_revision_dir(layout, int(recorded_revision))
        backup = directory / "backup"
        staged = directory / "staged"
        if "APPLIED" in steps:
            _restore_native_backup(layout, backup, staged, tuple(journal.get("applied_files", ())))
        if restore_extra is not None:
            restore_extra(layout, journal, directory)
        journal = dict(journal)
        journal["steps"] = [*steps, "ROLLED_BACK"]
        journal["updated_at"] = _timestamp()
        write_journal(layout, journal)
    except Exception as exc:
        journal = dict(journal)
        journal["steps"] = [*steps, "RECOVERY_REQUIRED"]
        journal["recovery_reason"] = f"{type(exc).__name__}"[:256]
        journal["updated_at"] = _timestamp()
        write_journal(layout, journal)
        raise RecoveryError("ROLLBACK_FAILED", txid) from exc


# ------------------------------------------------------------------------- #
# recovery decision (intent + actual observations -> typed decision)
# ------------------------------------------------------------------------- #
def decide_recovery(layout: ProfileLayout, journal: Mapping[str, Any]) -> str:
    """Truth table: intent + ACTUAL pointer/observations -> decision.

    Returns COMPLETE_COMMIT / ROLLBACK_TO_PREVIOUS / RECOVERY_REQUIRED.
    """
    previous = journal.get("previous_pointer") or {}
    proposed = journal.get("proposed_pointer") or {}
    intent_declared = bool(journal.get("pointer_intent_declared"))
    observation = observe_pointer(layout)
    if observation.status == "corrupt":
        return RECOVERY_REQUIRED  # corrupt pointer is NEVER treated as missing
    actual = observation.pointer if observation.status == "valid" else None

    if intent_declared:
        if observation.status == "valid" and dict(actual) == dict(proposed):
            if verify_committed(layout, journal):
                return COMPLETE_COMMIT
            if not previous:
                # fresh profile: actual provably equals the transaction's
                # proposed pointer -> safe removal back to the fresh state
                return ROLLBACK_TO_PREVIOUS
            return RECOVERY_REQUIRED
        if observation.status == "valid" and previous and dict(actual) == dict(previous):
            return ROLLBACK_TO_PREVIOUS
        if observation.status == "missing" and not previous:
            return ROLLBACK_TO_PREVIOUS  # fresh, pointer never landed
        return RECOVERY_REQUIRED
    # intent not declared: the pointer should never have moved
    if observation.status == "missing" and not previous:
        return ROLLBACK_TO_PREVIOUS
    if observation.status == "valid" and previous and dict(actual) == dict(previous):
        return ROLLBACK_TO_PREVIOUS
    return RECOVERY_REQUIRED


def recover_pending(layout: ProfileLayout, *, restore_extra: RestoreExtra | None = None,
                    receipts_digest: str | None = None) -> list[dict[str, object]]:
    """Idempotent recovery over every incomplete journal (fail closed)."""
    outcomes: list[dict[str, object]] = []
    for journal in pending_journals(layout):
        txid = str(journal.get("txid", ""))
        outcome: dict[str, object] = {
            "txid": txid,
            "operation": journal.get("operation"),
            "profile_id": journal.get("profile_id"),
        }
        if journal.get("malformed"):
            outcome["status"] = "recovery_required"
            outcome["code"] = "JOURNAL_MALFORMED"
            outcomes.append(outcome)
            continue
        try:
            decision = decide_recovery(layout, journal)
            if decision == COMPLETE_COMMIT:
                try:
                    _append_terminal(layout, journal, "COMMITTED")
                    outcome["status"] = "committed"
                except RecoveryError:
                    outcome["status"] = "recovery_required"
                    outcome["code"] = "TERMINAL_TRANSITION_FAILED"
                    continue
            elif decision == ROLLBACK_TO_PREVIOUS:
                rollback_transaction(layout, journal, restore_extra=restore_extra)
                outcome["status"] = "rolled_back"
            else:
                journal = dict(journal)
                journal["steps"] = [*journal["steps"], "RECOVERY_REQUIRED"]
                journal["recovery_reason"] = "intent/actual pointer mismatch or unverifiable state"
                journal["updated_at"] = _timestamp()
                write_journal(layout, journal)
                outcome["status"] = "recovery_required"
                outcome["code"] = "INTENT_ACTUAL_MISMATCH"
        except RecoveryError as exc:
            outcome["status"] = "recovery_required"
            outcome["code"] = exc.code
        except Exception as exc:
            outcome["status"] = "recovery_required"
            outcome["code"] = type(exc).__name__[:64]
        outcomes.append(outcome)
    return outcomes


def _append_terminal(layout: ProfileLayout, journal: Mapping[str, Any], terminal: str, **extra) -> dict[str, Any]:
    """THE single helper that moves a journal forward into a terminal state.

    Every terminal transition (recovery-confirmed or ordinary) goes through
    the same ``valid_terminal_transition`` authority as ``commit()`` and
    ``validate_journal()`` — recovery never hand-assembles step lists.  A
    missing pointer handoff is only ever appended when the current step IS
    the legal predecessor of POINTER_COMMITTED in the operation's graph,
    and it is explicitly marked ``confirmed_by_recovery=True``.
    """
    operation = str(journal.get("operation", ""))
    steps = list(journal.get("steps", ()))
    current = steps[-1] if steps else "PREPARED"
    if terminal == "COMMITTED" and current != "POINTER_COMMITTED":
        # recovery-confirmed pointer handoff: the pointer replacement
        # provably happened (actual == proposed), so the missing
        # POINTER_COMMITTED step is appended FIRST from its legal
        # predecessor — never from an arbitrary state
        if not valid_transition(operation, current, "POINTER_COMMITTED"):
            raise RecoveryError("INVALID_TERMINAL_TRANSITION", str(journal.get("txid", "?")))
        steps.append("POINTER_COMMITTED")
        journal = dict(journal)
        journal["steps"] = steps
        journal.update({"pointer_committed": True, "confirmed_by_recovery": True, "updated_at": _timestamp()})
        write_journal(layout, journal)
        steps = list(journal["steps"])
        current = "POINTER_COMMITTED"
    if not valid_terminal_transition(operation, current, terminal):
        raise RecoveryError("INVALID_TERMINAL_TRANSITION", str(journal.get("txid", "?")))
    updated = dict(journal)
    updated["steps"] = [*steps, terminal]
    updated["updated_at"] = _timestamp()
    updated.update(extra)
    write_journal(layout, updated)
    return updated


def close_committed(layout: ProfileLayout, journal: Mapping[str, Any]) -> None:
    """Close a journal as COMMITTED through the legal transition helper.

    Runtime failures detected AFTER the pointer replacement fulfilled the
    intent never roll back the fulfilled visibility commit; if the journal
    is missing POINTER_COMMITTED, the helper appends it with
    ``confirmed_by_recovery=True`` BEFORE the COMMITTED terminal.  A
    malformed journal is never auto-completed.
    """
    steps = journal.get("steps", ())
    if any(step in TERMINAL for step in steps):
        raise RecoveryError("TERMINAL_TRANSACTION", str(journal.get("txid", "?")))
    _append_terminal(layout, journal, "COMMITTED")


def handle_mutation_failure(layout: ProfileLayout, journal, *, restore_extra: RestoreExtra | None = None) -> str:
    """Unified runtime-failure path: returns the typed recovery DECISION.

    The same intent+actual decision table as crash recovery decides
    COMPLETE_COMMIT / ROLLBACK_TO_PREVIOUS / RECOVERY_REQUIRED and applies
    the side effects (close committed / roll back / mark recovery).  The
    caller MUST branch on the returned decision: a fulfilled commit is
    returned as SUCCESS (or a committed-specific typed outcome), never as
    an ordinary failure.
    """
    try:
        decision = decide_recovery(layout, journal.refresh())
    except Exception:
        try:
            journal.mark_recovery_required("malformed journal")
        except Exception:
            pass
        return RECOVERY_REQUIRED
    if decision == COMPLETE_COMMIT:
        try:
            close_committed(layout, journal.refresh())
        except Exception:
            try:
                journal.mark_recovery_required("commit close failed")
            except Exception:
                pass
            return RECOVERY_REQUIRED
    elif decision == ROLLBACK_TO_PREVIOUS:
        try:
            rollback_transaction(layout, journal.refresh(), restore_extra=restore_extra)
        except RecoveryError:
            try:
                journal.mark_recovery_required()
            except Exception:
                pass
            return RECOVERY_REQUIRED
    else:
        try:
            journal.mark_recovery_required("intent/actual mismatch at failure time")
        except Exception:
            pass
    return decision


MAX_RETAINED_TERMINAL_TRANSACTIONS = 16


def prune_terminal_transactions(layout: ProfileLayout, *, keep: int = MAX_RETAINED_TERMINAL_TRANSACTIONS, recorder=None) -> int:
    """Bounded retention of closed/terminal transaction artifacts.

    Committed/rolled-back journals and their transaction directories
    (including recoverable uninstall backups) are retained (most recent
    ``keep`` first) and the rest deleted durably; pruning failures are
    bounded diagnostics and never affect committed state.  Malformed
    journals are NEVER pruned automatically (human evidence).
    """
    from pathlib import Path as _Path

    from .transaction import TERMINAL as _TERMINAL

    del recorder
    directory = layout.transactions
    if not directory.is_dir():
        return 0
    closed: list[tuple[float, str]] = []
    for item in directory.iterdir():
        if item.is_symlink() or not (item.is_file() or item.is_dir()):
            continue
        name = item.name
        if name == "mutation.lease.json":
            continue
        if not name.endswith(".json"):
            continue
        try:
            journal = json.loads(item.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue  # malformed: retained as human evidence, never pruned
        if not isinstance(journal.get("steps"), list):
            continue
        if not any(step in _TERMINAL for step in journal["steps"]):
            continue
        closed.append((item.stat().st_mtime, item.name[:-5]))
    closed.sort(key=lambda entry: entry[0])
    pruned = 0
    for _mtime, txid in closed[:-keep]:
        journal_file = journal_path(layout, txid)
        tx_dir = layout.transactions / txid
        try:
            if journal_file.exists():
                remove_durable(journal_file)
            if tx_dir.exists():
                remove_tree_durable(tx_dir)
            if journal_file.exists() or tx_dir.exists():
                continue
            pruned += 1
        except (DurabilityError, OSError):
            continue
    return pruned


def assert_no_pending(layout: ProfileLayout, *, code: str = PROFILE_TRANSACTION_INCOMPLETE) -> None:
    """Fail closed when any incomplete or malformed journal exists."""
    pending = pending_journals(layout)
    if pending:
        txids = ",".join(str(p.get("txid", "?")) for p in pending[:4])
        raise ProfileNativeHomeError(code, txids[:256])


__all__ = [
    "COMPLETE_COMMIT",
    "MAX_RETAINED_TERMINAL_TRANSACTIONS",
    "RECOVERY_REQUIRED",
    "ROLLBACK_TO_PREVIOUS",
    "PointerObservation",
    "RecoveryError",
    "assert_no_pending",
    "close_committed",
    "decide_recovery",
    "handle_mutation_failure",
    "observe_pointer",
    "prune_terminal_transactions",
    "read_pointer_strict",
    "recompute_envelope_digest",
    "recover_pending",
    "rollback_transaction",
    "verify_committed",
]
