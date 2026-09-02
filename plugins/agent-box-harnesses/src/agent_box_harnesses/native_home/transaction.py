"""Unified Profile mutation transaction primitive (strict state machine).

ONE state machine, lease, journal schema and recovery rule for every
persistent mutation of a single Profile: config put, skill install/update/
rollback/uninstall, legacy import, envelope migration and execution
reconcile.

Visibility rule (frozen): `profile.json` is the ONLY current pointer and
its atomic replacement is the ONLY visibility commit point.  Everything
before it (staged files, native config patch, revision envelope) is
journaled and invisible to `get()/list()`.  Crash recovery therefore never
guesses from the last journal step: the journal carries the FULL commit
intent (previous pointer snapshot, proposed pointer snapshot, revision
intent, receipts digests, applied file manifest) and recovery reads the
ACTUAL durable pointer and derives a deterministic decision
(COMPLETE_COMMIT / ROLLBACK_TO_PREVIOUS / RECOVERY_REQUIRED).

Strict transitions (frozen, validated on every step AND on every journal
read):

    linear operations (profile-config, skill-install/skill-update/
    skill-rollback/skill-uninstall, legacy-import, envelope-migration):
        PREPARED -> STAGED -> APPLIED -> REVISION_WRITTEN ->
        POINTER_COMMITTED -> COMMITTED

    reconcile (no revision written, no staged files):
        PREPARED -> APPLIED -> POINTER_COMMITTED -> COMMITTED

A terminal state is unique and final; repeated steps and out-of-order
steps are malformed journals (fail closed, never trusted by recovery).
``set_pointer_intent`` must be declared BEFORE the pointer replacement; the
POINTER_COMMITTED step requires it.

A journal NEVER contains file content, credential values or host-absolute
paths — only digests, bounded names and the two pointer snapshots (both
credential-free).
"""
from __future__ import annotations

import json
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

from .durable import DurabilityError, atomic_write_durable, remove_durable
from .failures import (
    PROFILE_TRANSACTION_INCOMPLETE,
    ProfileNativeHomeError,
)

JOURNAL_SCHEMA_VERSION = 2
MAX_JOURNAL_BYTES = 96 * 1024

# Ordered base steps shared by every operation.
_BASE_STEPS = (
    "PREPARED", "STAGED", "APPLIED", "REVISION_WRITTEN",
    "POINTER_COMMITTED", "COMMITTED",
)
# Reconcile never stages files and never writes a revision envelope.
RECONCILE_STEPS = (
    "PREPARED", "APPLIED", "POINTER_COMMITTED", "COMMITTED",
)
TERMINAL = frozenset({"COMMITTED", "ROLLED_BACK", "RECOVERY_REQUIRED"})

# Operations that write a revision envelope + move the pointer revision.
REVISION_OPS = frozenset({
    "profile-config", "skill-install", "skill-update", "skill-rollback",
    "skill-uninstall", "legacy-import", "envelope-migration",
})
# Operations that also mutate the receipt index.
RECEIPT_OPS = frozenset({
    "skill-install", "skill-update", "skill-rollback", "skill-uninstall",
})

_TXID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
_LEGACY_JOURNAL_NAMES = frozenset({"mutation.lease.json"})
_MALFORMED = "JOURNAL_MALFORMED"


class TransactionError(ProfileNativeHomeError):
    pass


def new_txid(prefix: str = "tx") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:16]}"


def operation_steps(operation: str) -> tuple[str, ...]:
    if operation == "reconcile":
        return RECONCILE_STEPS
    if operation not in REVISION_OPS and operation not in RECEIPT_OPS:
        raise TransactionError("UNKNOWN_OPERATION", str(operation)[:64])
    return _BASE_STEPS


def valid_transition(operation: str, current: str, next_step: str) -> bool:
    """Strict transition check: next must be the immediate successor."""
    steps = operation_steps(operation)
    try:
        index = steps.index(current)
    except ValueError:
        return False
    if current in TERMINAL:
        return False
    return index + 1 < len(steps) and steps[index + 1] == next_step


def valid_terminal_transition(operation: str, current: str, terminal: str) -> bool:
    """Terminal transition authority (frozen).

    COMMITTED may ONLY follow POINTER_COMMITTED — a commit that has not
    reached the pointer handoff is structurally impossible.  ROLLED_BACK /
    RECOVERY_REQUIRED are exceptional terminals: they may follow any legal
    non-terminal step of the operation's graph (a rollback can be forced
    from any journaled stage), but NEVER a terminal and NEVER a step that
    is not in the operation's graph.
    """
    if terminal not in TERMINAL:
        return False
    if terminal == "COMMITTED":
        return current == "POINTER_COMMITTED"
    return current in operation_steps(operation) and current not in TERMINAL


def journal_path(layout, txid: str) -> Path:
    if not _TXID.fullmatch(txid):
        raise TransactionError("INVALID_TXID", txid[:64])
    return layout.transactions / f"{txid}.json"


def _journal_stage(layout, journal: Mapping[str, Any]) -> str:
    steps = journal.get("steps", ())
    return f"journal:{str(journal.get('txid', '?'))}:{steps[-1] if steps else 'START'}"


def write_journal(layout, journal: Mapping[str, Any]) -> None:
    from .durable import _record

    from .tree import ensure_plain_directory

    ensure_plain_directory(layout.transactions)
    target = journal_path(layout, str(journal["txid"]))
    raw = (json.dumps(journal, sort_keys=True, separators=(",", ":")) + "\n").encode()
    if len(raw) > MAX_JOURNAL_BYTES:
        raise TransactionError("JOURNAL_TOO_LARGE", str(journal["txid"])[:64])
    _record(_journal_stage(layout, journal))
    try:
        atomic_write_durable(target, raw)
    except DurabilityError as exc:
        raise TransactionError("JOURNAL_DURABILITY_FAILED", str(journal["txid"])[:64]) from exc


def validate_journal(layout, txid: str, journal: Mapping[str, Any]) -> None:
    """Strict journal validation: schema, steps order, terminals, facts.

    Malformed/out-of-order journals raise ``TransactionError`` so recovery
    treats them as RECOVERY_REQUIRED — they are NEVER trusted input for a
    rollback or a commit decision.
    """
    if not isinstance(journal, dict) or journal.get("schema_version") != JOURNAL_SCHEMA_VERSION:
        raise TransactionError(_MALFORMED, txid)
    if str(journal.get("txid")) != txid or not isinstance(journal.get("steps"), list):
        raise TransactionError(_MALFORMED, txid)
    operation = str(journal.get("operation", ""))
    steps = journal["steps"]
    if not steps or steps[0] != "PREPARED":
        raise TransactionError(_MALFORMED, txid)
    terminals = [step for step in steps if step in TERMINAL]
    if len(terminals) > 1 or (terminals and terminals[0] != steps[-1]):
        raise TransactionError(_MALFORMED, txid)  # terminal unique AND final
    # strict ordered walk: every step — INCLUDING the terminal — must come
    # from a legal predecessor of the operation's graph; a jump into
    # COMMITTED from any pre-POINTER step is malformed
    current = "PREPARED"
    for index, step in enumerate(steps[1:], start=1):
        if step in TERMINAL:
            if not valid_terminal_transition(operation, current, step):
                raise TransactionError(_MALFORMED, txid)
            if index != len(steps) - 1:
                raise TransactionError(_MALFORMED, txid)  # terminal is final
            break
        if not valid_transition(operation, current, step):
            raise TransactionError(_MALFORMED, txid)
        current = step
    # required facts per reached step
    if "REVISION_WRITTEN" in steps and journal.get("revision_written") is None:
        raise TransactionError(_MALFORMED, txid)
    if "POINTER_COMMITTED" in steps and not journal.get("pointer_intent_declared"):
        raise TransactionError(_MALFORMED, txid)
    if "POINTER_COMMITTED" in steps and not isinstance(journal.get("proposed_pointer"), dict):
        raise TransactionError(_MALFORMED, txid)
    if "APPLIED" in steps and not isinstance(journal.get("applied_files"), (list, tuple)):
        raise TransactionError(_MALFORMED, txid)
    if operation in REVISION_OPS and "REVISION_WRITTEN" not in steps:
        if "POINTER_COMMITTED" in steps:
            raise TransactionError(_MALFORMED, txid)


def read_journal(layout, txid: str) -> dict[str, Any]:
    path = journal_path(layout, txid)
    if path.is_symlink() or not path.is_file():
        raise TransactionError("JOURNAL_NOT_FOUND", txid)
    try:
        journal = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise TransactionError(_MALFORMED, txid) from exc
    validate_journal(layout, txid, journal)
    return journal


def pending_journals(layout) -> tuple[dict[str, Any], ...]:
    """Incomplete, schema-valid journals; malformed ones surface typed."""
    directory = layout.transactions
    if not directory.is_dir():
        return ()
    pending: list[dict[str, Any]] = []
    for item in sorted(directory.glob("*.json")):
        if item.is_symlink() or item.name in _LEGACY_JOURNAL_NAMES:
            continue
        txid = item.name[:-5]
        try:
            journal = read_journal(layout, txid)
        except TransactionError:
            pending.append({"txid": txid, "malformed": True, "steps": ("MALFORMED",), "operation": None})
            continue
        if not journal.get("steps") or journal["steps"][-1] not in TERMINAL:
            pending.append(journal)
    return tuple(pending)


@dataclass(frozen=True)
class TransactionState:
    """Bounded public description of one transaction (no secrets/paths)."""

    txid: str
    operation: str
    steps: tuple[str, ...]
    terminal: str  # "active" | COMMITTED | ROLLED_BACK | RECOVERY_REQUIRED
    expected_revision: int | None
    expected_generation: int | None
    pointer_intent_declared: bool = False

    def public(self) -> dict[str, object]:
        return {
            "txid": self.txid,
            "operation": self.operation,
            "steps": list(self.steps),
            "terminal": self.terminal,
            "expected_revision": self.expected_revision,
            "expected_generation": self.expected_generation,
            "pointer_intent_declared": self.pointer_intent_declared,
        }


class ProfileTransaction:
    """One journaled mutation over one Profile (single-writer lease assumed).

    The commit-intent model (frozen): BEFORE the pointer replacement the
    caller declares the FULL proposed pointer via ``set_pointer_intent``;
    the recovery layer compares the actual pointer against
    ``previous_pointer`` / ``proposed_pointer`` and never guesses from the
    step list.
    """

    def __init__(self, layout, *, operation: str, expected_revision: int | None = None,
                 expected_generation: int | None = None, txid: str | None = None,
                 previous_pointer: Mapping[str, Any] | None = None,
                 receipts_digest_before: str = "") -> None:
        self.layout = layout
        self.txid = txid or new_txid(operation[:12] or "tx")
        self.operation = operation
        self.expected_revision = expected_revision
        self.expected_generation = expected_generation
        self._journal: dict[str, Any] = {
            "schema_version": JOURNAL_SCHEMA_VERSION,
            "txid": self.txid,
            "harness_type": layout.harness_type,
            "profile_id": layout.profile_id,
            "operation": operation,
            "expected_revision": expected_revision,
            "expected_generation": expected_generation,
            # FULL previous pointer snapshot (credential-free, bounded) or
            # empty for a fresh profile (no previous pointer existed)
            "previous_pointer": dict(previous_pointer) if previous_pointer else {},
            "proposed_pointer": {},
            "pointer_intent_declared": False,
            "receipts_digest_before": receipts_digest_before,
            "receipts_digest_after": "",
            "steps": ["PREPARED"],
            "revision_written": None,
            "pointer_committed": None,
            "backup_dir": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        write_journal(layout, self._journal)

    # ----- steps ------------------------------------------------------ #
    def step(self, name: str, **extra: Any) -> None:
        journal = self._journal
        if not journal["steps"]:
            raise TransactionError("EMPTY_JOURNAL", self.txid)
        if journal["steps"][-1] in TERMINAL:
            raise TransactionError("TERMINAL_TRANSACTION", self.txid)
        current = journal["steps"]
        if name in TERMINAL:
            if not valid_terminal_transition(self.operation, current[-1], name):
                raise TransactionError(
                    "INVALID_TERMINAL_TRANSITION",
                    f"{self.operation}: {'->'.join(current[-2:])} -> {name}",
                )
        elif not valid_transition(self.operation, current[-1], name):
            raise TransactionError(
                "INVALID_TRANSITION",
                f"{self.operation}: {'->'.join(current[-2:])} -> {name}",
            )
        if name == "POINTER_COMMITTED" and not journal.get("pointer_intent_declared"):
            raise TransactionError("POINTER_INTENT_REQUIRED", self.txid)
        journal["steps"] = [*current, name]
        journal["updated_at"] = datetime.now(timezone.utc).isoformat()
        journal.update({key: value for key, value in extra.items() if value is not None})
        if "revision_written" in extra:
            journal["revision_written"] = extra["revision_written"]
        write_journal(self.layout, journal)

    def set_pointer_intent(self, proposed_pointer: Mapping[str, Any]) -> None:
        """Declare the FULL proposed pointer BEFORE the replacement.

        This is the commit intent: crash recovery distinguishes
        "actual == proposed" (committed) from "actual == previous"
        (not committed) purely from intent + actual observations.
        """
        journal = self._journal
        if journal["steps"][-1] in TERMINAL:
            raise TransactionError("TERMINAL_TRANSACTION", self.txid)
        if not isinstance(proposed_pointer, dict) or not proposed_pointer:
            raise TransactionError("PROPOSED_POINTER_INVALID", self.txid)
        journal["proposed_pointer"] = dict(proposed_pointer)
        journal["pointer_intent_declared"] = True
        journal["updated_at"] = datetime.now(timezone.utc).isoformat()
        write_journal(self.layout, journal)

    def set_receipts_after(self, receipts_digest: str) -> None:
        journal = self._journal
        if journal["steps"][-1] in TERMINAL:
            raise TransactionError("TERMINAL_TRANSACTION", self.txid)
        journal["receipts_digest_after"] = receipts_digest
        journal["updated_at"] = datetime.now(timezone.utc).isoformat()
        write_journal(self.layout, journal)

    def commit(self) -> None:
        journal = self._journal
        if not journal["steps"] or journal["steps"][-1] in TERMINAL:
            raise TransactionError("TERMINAL_TRANSACTION", self.txid)
        if not valid_terminal_transition(self.operation, journal["steps"][-1], "COMMITTED"):
            raise TransactionError(
                "INVALID_TERMINAL_TRANSITION",
                f"{self.operation}: {'->'.join(journal['steps'][-2:])} -> COMMITTED",
            )
        self.step("COMMITTED")

    def mark_rolled_back(self, reason: str = "") -> None:
        self._terminate("ROLLED_BACK", reason)

    def mark_recovery_required(self, reason: str = "") -> None:
        self._terminate("RECOVERY_REQUIRED", reason)

    def _terminate(self, terminal: str, reason: str) -> None:
        journal = self._journal
        if not journal["steps"] or journal["steps"][-1] in TERMINAL:
            raise TransactionError("TERMINAL_TRANSACTION", self.txid)
        if not valid_terminal_transition(self.operation, journal["steps"][-1], terminal):
            raise TransactionError("INVALID_TERMINAL_TRANSITION", f"{self.operation} -> {terminal}")
        journal["steps"] = [*journal["steps"], terminal]
        journal[f"{terminal.lower()}_reason"] = reason[:256]
        journal["updated_at"] = datetime.now(timezone.utc).isoformat()
        write_journal(self.layout, journal)

    def refresh(self) -> dict[str, Any]:
        self._journal = read_journal(self.layout, self.txid)
        return self._journal

    def state(self) -> TransactionState:
        journal = self.refresh()
        terminal = "active"
        for name in ("COMMITTED", "ROLLED_BACK", "RECOVERY_REQUIRED"):
            if name in journal["steps"]:
                terminal = name
        return TransactionState(
            self.txid, self.operation, tuple(journal["steps"]), terminal,
            journal.get("expected_revision"), journal.get("expected_generation"),
            bool(journal.get("pointer_intent_declared")),
        )

    # ----- helpers ---------------------------------------------------- #
    @property
    def directory(self) -> Path:
        return self.layout.transactions / self.txid

    def staged_dir(self) -> Path:
        directory = self.directory
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        return directory / "staged"

    def backup_dir(self) -> Path:
        directory = self.directory
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        return directory / "backup"

    def cleanup_dir(self, *, keep_backup: bool = False) -> None:
        """Post-commit cleanup: drop staged artifacts and the journal.

        ``keep_backup=True`` retains the transaction backup (recoverable
        uninstall evidence); the journal file is always removed after a
        successful commit.
        """
        directory = self.directory
        if directory.exists():
            import shutil

            if keep_backup:
                staged = directory / "staged"
                if staged.exists():
                    from .durable import remove_tree_durable
                    remove_tree_durable(staged)
            else:
                from .durable import remove_tree_durable
                remove_tree_durable(directory)
        journal_file = journal_path(self.layout, self.txid)
        if journal_file.exists():
            try:
                remove_durable(journal_file)
            except DurabilityError:
                # a failed cleanup must NEVER affect the already-committed
                # state; the leftover terminal journal is bounded by
                # transaction pruning instead
                pass


__all__ = [
    "JOURNAL_SCHEMA_VERSION",
    "MAX_JOURNAL_BYTES",
    "ProfileTransaction",
    "RECEIPT_OPS",
    "RECONCILE_STEPS",
    "REVISION_OPS",
    "TERMINAL",
    "TransactionError",
    "TransactionState",
    "journal_path",
    "new_txid",
    "operation_steps",
    "pending_journals",
    "read_journal",
    "validate_journal",
    "valid_terminal_transition",
    "valid_transition",
    "write_journal",
]
