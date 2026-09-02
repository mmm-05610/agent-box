"""Execution-scoped NativeHomeView: prepare / reconcile / recovery.

The execution chain never writes into the profile's real native home and
never rebuilds it from scratch:

    Exact ProfileRef -> resolve the one persistent Native Home
    -> FREEZE under the mutation lease: verify pending/revision/generation,
       policy-aware safe copy, base manifest, declared ephemeral overlays,
       active marker registration — all in ONE critical section
    -> mount into the Sandbox/Runtime (rw, /runtime/home)
    -> Harness runs
    -> reconcile as ONE lease-held journaled transaction: decision ->
       copy-back (with backup) -> persistent home digest -> generation CAS
       -> pointer commit; ambiguous/drifted never writes back
    -> cleanup (idempotent; never deletes the profile native home)

Concurrency: mutations (config edits, skill install/update/remove) acquire
the same lease FIRST and check the active-execution registry INSIDE it;
prepare() holds the lease for its whole critical section, so a view can
never observe a half-applied mutation and a mutation can never interleave
with a copy.  Two prepare() calls may freeze the same revision; mutations
either wait or fail closed typed.
"""
from __future__ import annotations

import json
import os
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence

from .failures import (
    NATIVE_HOME_RECONCILE_AMBIGUOUS,
    NATIVE_HOME_RECONCILE_FAILED,
    NATIVE_HOME_VIEW_PREPARE_FAILED,
    PROFILE_MUTATION_LEASE_CONFLICT,
    PROFILE_NATIVE_HOME_DRIFT,
    PROFILE_NATIVE_HOME_MISSING,
    PROFILE_TRANSACTION_INCOMPLETE,
    NativeHomeError,
    ProfileNativeHomeError,
)
from .layout import ProfileLayout, validate_identity
from .policy import CREDENTIAL, EPHEMERAL, SESSION, UNKNOWN, NativeHomePolicy
from .recovery import COMPLETE_COMMIT, RECOVERY_REQUIRED, assert_no_pending, handle_mutation_failure, read_pointer_strict
from .transaction import ProfileTransaction
from .tree import copy_tree, digest_tree, ensure_plain_directory, read_manifest

MAX_RECOVERY_VIEWS = 16


class FrozenProfileSnapshot:
    """Exact identity a view freeze is validated against (harnesses-owned).

    ``revision``/``digest`` come from the resolved exact ProfileRef
    envelope; ``prepare`` verifies them against the current pointer INSIDE
    the mutation lease, so a config/skill mutation between resolution and
    materialization is a typed reject — never a silent mix of an old
    envelope with a new native home.
    """

    __slots__ = ("harness_type", "profile_id", "revision", "digest")

    def __init__(self, harness_type: str, profile_id: str, revision: int, digest: str) -> None:
        validate_identity(harness_type, profile_id)
        if revision < 1 or not digest.startswith("sha256:"):
            raise ProfileNativeHomeError("FROZEN_SNAPSHOT_INVALID")
        self.harness_type = harness_type
        self.profile_id = profile_id
        self.revision = revision
        self.digest = digest


class ProfileMutationLease:
    """One-writer-at-a-time lease over a profile's native home state.

    The lease is a typed marker file; acquiring is atomic via exclusive
    creation semantics (``os.open`` with ``O_CREAT|O_EXCL``).  Stale leases
    never auto-expire silently: they are surfaced typed and released only
    through an explicit operation (``break_stale``), matching the frozen
    "no silent last-writer-wins" rule.
    """

    def __init__(self, layout: ProfileLayout) -> None:
        self.layout = layout

    def acquire(self, owner: str, detail: str = "") -> None:
        validate_identity(self.layout.harness_type, self.layout.profile_id)
        target = self.layout.mutation_lease
        if target.exists():
            raise ProfileNativeHomeError(PROFILE_MUTATION_LEASE_CONFLICT, owner)
        ensure_plain_directory(target.parent)
        try:
            fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError as exc:
            raise ProfileNativeHomeError(PROFILE_MUTATION_LEASE_CONFLICT, owner) from exc
        payload = {"owner": owner, "detail": detail, "acquired_at": time.time()}
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            from .durable import fsync_directory
        except ImportError:  # pragma: no cover
            pass
        else:
            try:
                fsync_directory(target.parent)
            except Exception:
                pass
        self.owner = owner

    def release(self) -> None:
        marker = self.layout.mutation_lease
        try:
            marker.unlink(missing_ok=True)
        except OSError:
            raise

    def holder(self) -> dict[str, object] | None:
        marker = self.layout.mutation_lease
        if not marker.exists():
            return None
        try:
            return json.loads(marker.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise ProfileNativeHomeError(PROFILE_MUTATION_LEASE_CONFLICT, "unreadable lease")

    def break_stale(self, expected_owner: str) -> None:
        holder = self.holder()
        if holder is None:
            return
        if holder.get("owner") != expected_owner:
            raise ProfileNativeHomeError(PROFILE_MUTATION_LEASE_CONFLICT, "stale lease owner mismatch")
        self.release()


class ActiveExecutionRegistry:
    """Per-profile active execution markers (read-scoped view owners).

    Mutations must fail closed while markers exist; markers are removed by
    the owning execution's reconcile/discard and are recoverable typed.
    """

    def __init__(self, layout: ProfileLayout) -> None:
        self.layout = layout

    def register(self, execution_id: str) -> None:
        marker = self.layout.active_execution_marker(execution_id)
        ensure_plain_directory(marker.parent)
        if marker.exists():
            raise ProfileNativeHomeError(PROFILE_TRANSACTION_INCOMPLETE, execution_id)
        payload = {"execution_id": execution_id, "acquired_at": time.time()}
        fd = os.open(marker, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())

    def active(self) -> tuple[str, ...]:
        directory = self.layout.active_executions
        if not directory.is_dir():
            return ()
        return tuple(sorted(item.name.removesuffix(".json") for item in directory.glob("*.json") if not item.is_symlink()))

    def unregister(self, execution_id: str) -> None:
        marker = self.layout.active_execution_marker(execution_id)
        marker.unlink(missing_ok=True)

    def assert_idle(self) -> None:
        active = self.active()
        if active:
            raise ProfileNativeHomeError(
                PROFILE_MUTATION_LEASE_CONFLICT, "active executions: " + ",".join(active[:4]),
            )


@dataclass(frozen=True)
class ReconcileReport:
    status: str  # "ok" | "ambiguous" | "failed"
    code: str
    copied_back: tuple[str, ...] = ()
    skipped: tuple[str, ...] = ()
    detail: str = ""
    native_state_generation: int | None = None
    native_tree_digest: str = ""

    def public(self) -> dict[str, object]:
        return {
            "status": self.status, "code": self.code, "copied_back": list(self.copied_back)[:64],
            "skipped": list(self.skipped)[:64], "detail": self.detail[:256],
            "native_state_generation": self.native_state_generation,
            "native_tree_digest": self.native_tree_digest,
        }


class NativeHomeView:
    """One execution's isolated, policy-governed view of a Profile Native Home."""

    # Kinds allowed to flow BACK from an execution into the persistent home.
    _RECONCILE_KINDS = frozenset({SESSION, UNKNOWN})

    def __init__(self, layout: ProfileLayout, policy: NativeHomePolicy, *, execution_id: str, staging_root: Path, profile_store=None) -> None:
        validate_identity(layout.harness_type, layout.profile_id)
        self.layout = layout
        self.policy = policy
        self.execution_id = execution_id
        self._profile_store = profile_store
        self.root = (Path(staging_root).resolve() / execution_id / "home").resolve()
        if self.root.parent.parent != Path(staging_root).resolve():
            raise ProfileNativeHomeError("INVALID_EXECUTION_ID", execution_id)
        self._base_manifest: Mapping[str, str] | None = None
        self._active_registry = ActiveExecutionRegistry(layout)
        self._frozen_generation: int | None = None
        self._frozen_tree_digest: str = ""

    # ------------------------------------------------------------------ #
    # prepare (ONE lease-held critical section; the freeze)
    # ------------------------------------------------------------------ #
    def prepare(self, *, overlays: Sequence[tuple[str, bytes]] = (), frozen: FrozenProfileSnapshot | None = None) -> None:
        """Materialize the view inside one mutation-lease critical section.

        Order (frozen): acquire lease -> assert no pending journal -> read
        the current pointer STRICTLY (missing/corrupt/identity mismatch all
        fail closed; a corrupt pointer is NEVER treated as fresh) ->
        verify the exact frozen ProfileRef identity (revision + digest)
        when provided -> freeze native_state_generation + native_tree_digest
        from that pointer -> copy native-home (safe, credential-free) ->
        base manifest -> declared ephemeral overlays -> register the
        active-execution marker -> release lease.

        An exception anywhere cleans the partial view root and releases the
        lease; no marker or half view survives.  The frozen generation is
        read from the snapshot INSIDE the lease — callers must use
        ``expected_generation()`` afterwards, never a pre-lease read.
        """
        lease = ProfileMutationLease(self.layout)
        lease.acquire(f"execution:{self.execution_id}", "prepare")
        prepared = False
        try:
            assert_no_pending(self.layout)
            pointer = read_pointer_strict(self.layout) if self._profile_store is None else self._profile_store.pointer(self.layout.harness_type, self.layout.profile_id)
            if frozen is not None:
                if str(pointer.get("harness_type", "")) != frozen.harness_type or str(pointer.get("profile_id", "")) != frozen.profile_id:
                    raise ProfileNativeHomeError("PROFILE_FREEZE_IDENTITY_MISMATCH", self.layout.profile_id)
                if int(pointer.get("revision", -1)) != frozen.revision:
                    raise ProfileNativeHomeError("PROFILE_FREEZE_REVISION_MISMATCH",
                                                 f"expected r{frozen.revision}, current r{pointer.get('revision')}")
                if str(pointer.get("digest", "")) != frozen.digest:
                    raise ProfileNativeHomeError("PROFILE_FREEZE_DIGEST_MISMATCH", self.layout.profile_id)
            self._frozen_generation = int(pointer.get("native_state_generation", 0))
            declared_tree_digest = str(pointer.get("native_tree_digest", "") or "")
            home = self.layout.native_home
            if not home.exists():
                raise ProfileNativeHomeError(PROFILE_NATIVE_HOME_MISSING, self.layout.profile_id)
            # PHYSICAL home integrity freeze (frozen): recompute the actual
            # persistent native-home tree digest with the SAME policy walk
            # (credential paths never read, symlinks rejected, bounded) and
            # require it to equal the pointer's declared digest.  A
            # transaction-external drift is never executed silently and is
            # never auto-accepted into the pointer.
            actual_home_digest = digest_tree(self.policy, home)
            if not declared_tree_digest or not declared_tree_digest.startswith("sha256:"):
                raise ProfileNativeHomeError("PROFILE_FREEZE_NATIVE_HOME_DRIFT",
                                             "pointer native_tree_digest missing or invalid")
            if declared_tree_digest != actual_home_digest:
                raise ProfileNativeHomeError("PROFILE_FREEZE_NATIVE_HOME_DRIFT", self.layout.profile_id)
            self._frozen_tree_digest = declared_tree_digest
            if self.root.exists():
                raise ProfileNativeHomeError("EXECUTION_VIEW_ALREADY_MATERIALIZED", self.execution_id)
            copy_tree(self.policy, home, self.root)
            self._base_manifest = read_manifest(self.policy, self.root)
            for relative, content in overlays:
                self._write_overlay(relative, content)
            self._active_registry.register(self.execution_id)
            prepared = True
        except ProfileNativeHomeError:
            raise
        except NativeHomeError as exc:
            raise ProfileNativeHomeError(NATIVE_HOME_VIEW_PREPARE_FAILED, exc.code) from exc
        except Exception as exc:
            raise ProfileNativeHomeError(NATIVE_HOME_VIEW_PREPARE_FAILED, type(exc).__name__) from exc
        finally:
            if not prepared:
                shutil.rmtree(self.root, ignore_errors=True)
            lease.release()

    def expected_generation(self) -> int | None:
        """The generation frozen INSIDE prepare (never read pre-lease)."""
        return self._frozen_generation

    def frozen_tree_digest(self) -> str:
        return self._frozen_tree_digest

    def _write_overlay(self, relative: str, content: bytes) -> None:
        from .tree import classify_path

        if classify_path(self.policy, relative) in {CREDENTIAL, EPHEMERAL}:
            raise ProfileNativeHomeError(NATIVE_HOME_VIEW_PREPARE_FAILED, "overlay targets a forbidden kind")
        target = (self.root / relative).resolve()
        if target.parent != self.root and self.root not in target.parents:
            raise ProfileNativeHomeError(NATIVE_HOME_VIEW_PREPARE_FAILED, "overlay escapes the view")
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        target.write_bytes(content)
        try:
            os.chmod(target, 0o600)
        except OSError:
            pass

    # ------------------------------------------------------------------ #
    # verification
    # ------------------------------------------------------------------ #
    def verify_overlay(self, expected: Sequence[tuple[str, str]]) -> None:
        """Fail closed when a declared overlay file is missing or drifted."""
        manifest = read_manifest(self.policy, self.root)
        for relative, digest in expected:
            actual = manifest.get(relative)
            if actual is None:
                raise ProfileNativeHomeError("EXECUTION_VIEW_OVERLAY_MISSING", relative)
            if actual != digest.removeprefix("sha256:"):
                raise ProfileNativeHomeError("EXECUTION_VIEW_OVERLAY_DRIFT", relative)

    def tree_digest(self) -> str:
        return digest_tree(self.policy, self.root)

    # ------------------------------------------------------------------ #
    # reconcile (ONE lease-held journaled transaction)
    # ------------------------------------------------------------------ #
    def reconcile(self, *, expected_generation: int | None = None) -> ReconcileReport:
        """Write back only allowed, unambiguous native state changes.

        The whole operation runs under the mutation lease as one journaled
        transaction: generation CAS + no-pending checks first, then pure
        decision, then copy-back (each overwritten file backed up), then the
        PERSISTENT home's tree digest is computed and the pointer advances
        via generation CAS.  On any failure the copy-back is rolled back
        from the backup and the journal is closed ROLLED_BACK /
        RECOVERY_REQUIRED — never a half write-back with a stale generation.

        Rules (frozen): only SESSION/UNKNOWN classified paths are
        candidates; credential/ephemeral/skill/config-managed paths never
        flow back; files deleted inside the view are never deleted in the
        home; a path changed on BOTH sides since the view base is ambiguous
        and aborts the whole reconcile (no partial write-back).
        """
        lease = ProfileMutationLease(self.layout)
        try:
            lease.acquire(f"execution:{self.execution_id}", "reconcile")
        except ProfileNativeHomeError as exc:
            if exc.code == PROFILE_MUTATION_LEASE_CONFLICT:
                return ReconcileReport("ambiguous", PROFILE_MUTATION_LEASE_CONFLICT, detail=exc.args[0][:256])
            raise
        journal: ProfileTransaction | None = None
        try:
            assert_no_pending(self.layout)
            pointer = self._read_pointer_strict()
            actual_generation = int(pointer.get("native_state_generation", 0))
            if expected_generation is not None and actual_generation != expected_generation:
                return ReconcileReport("ambiguous", PROFILE_NATIVE_HOME_DRIFT, detail=f"generation {actual_generation} != {expected_generation}")
            journal = ProfileTransaction(
                self.layout, operation="reconcile",
                expected_generation=actual_generation,
                previous_pointer=pointer,
            )
            base = self._base_manifest or {}
            current = read_manifest(self.policy, self.root)
            home_manifest = read_manifest(self.policy, self.layout.native_home)
            copied: list[str] = []
            skipped: list[str] = []
            ambiguous: list[str] = []
            copied_local = copied
            for relative, digest in sorted(current.items()):
                if self.policy.classify(relative) not in self._RECONCILE_KINDS:
                    continue
                base_digest = base.get(relative)
                home_digest = home_manifest.get(relative)
                if home_digest == digest:
                    continue
                if base_digest is None or home_digest is None or home_digest == base_digest:
                    copied.append(relative)
                    continue
                ambiguous.append(relative)
            missing = set(relative for relative in base if relative not in current)
            skipped.extend(sorted(missing)[:64])
            if ambiguous:
                journal.mark_rolled_back("ambiguous decision")
                return ReconcileReport(
                    "ambiguous", NATIVE_HOME_RECONCILE_AMBIGUOUS,
                    copied_back=(), skipped=tuple(skipped),
                    detail="conflicting paths: " + ",".join(sorted(ambiguous)[:8]),
                )
            # decision-then-commit with per-file backup of overwritten homes
            backup = journal.backup_dir()
            staged = journal.staged_dir()
            # write-ahead: record the APPLIED manifest BEFORE executing the
            # copy-back so a mid-copy crash rolls back exactly that manifest
            journal.step("APPLIED", applied_files=list(copied))
            applied: list[str] = []
            for relative in copied:
                source = (self.root / relative).resolve()
                target = (self.layout.native_home / relative).resolve()
                if self.root not in source.parents or self.layout.native_home not in target.parents:
                    raise ProfileNativeHomeError(NATIVE_HOME_RECONCILE_FAILED, relative)
                if target.exists():
                    previous = backup / relative
                    previous.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    from .durable import durable_copy
                    durable_copy(target, previous)
                # the staged copy holds the ACTUAL applied content: recovery
                # can prove a file was created by this transaction before
                # ever deleting it (never delete unverifiable state)
                staged_copy = staged / relative
                staged_copy.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                from .durable import durable_copy
                durable_copy(source, staged_copy)
                durable_copy(source, target)
                applied.append(relative)
            # persistent home digest (NOT the view digest, which carries the
            # ephemeral overlays) as the source of the pointer's tree digest
            persistent_digest = digest_tree(self.policy, self.layout.native_home)
            # declare the FULL proposed pointer BEFORE the atomic replace:
            # crash recovery compares actual-vs-proposed, never a step list
            import time as _time

            proposed = dict(pointer)
            proposed["native_state_generation"] = actual_generation + 1
            proposed["native_tree_digest"] = persistent_digest
            proposed["updated_at"] = _time.strftime("%Y-%m-%dT%H:%M:%S+00:00", _time.gmtime())
            journal.set_pointer_intent(proposed)
            generation = self._commit_generation(persistent_digest, actual_generation, proposed_pointer=proposed)
            journal.step("POINTER_COMMITTED", pointer_committed=True)
            journal.commit()
            journal.cleanup_dir()
            return ReconcileReport(
                "ok", "OK", copied_back=tuple(applied), skipped=tuple(skipped),
                native_state_generation=generation, native_tree_digest=persistent_digest,
            )
        except ProfileNativeHomeError as exc:
            if journal is not None:
                decision = handle_mutation_failure(self.layout, journal)
                if decision == COMPLETE_COMMIT:
                    return ReconcileReport("ok", "OK", copied_back=tuple(copied), skipped=tuple(skipped),
                                           native_state_generation=_generation_after(self.layout),
                                           native_tree_digest=digest_tree(self.policy, self.layout.native_home))
                if decision == RECOVERY_REQUIRED:
                    return ReconcileReport("failed", "PROFILE_RECOVERY_REQUIRED", detail=exc.code[:128])
            raise
        except Exception as exc:
            if journal is not None:
                decision = handle_mutation_failure(self.layout, journal)
                if decision == COMPLETE_COMMIT:
                    return ReconcileReport("ok", "OK", copied_back=tuple(copied), skipped=tuple(skipped),
                                           native_state_generation=_generation_after(self.layout),
                                           native_tree_digest=digest_tree(self.policy, self.layout.native_home))
                if decision == RECOVERY_REQUIRED:
                    return ReconcileReport("failed", "PROFILE_RECOVERY_REQUIRED", detail=type(exc).__name__[:128])
            return ReconcileReport("failed", NATIVE_HOME_RECONCILE_FAILED, detail=type(exc).__name__[:256])
        finally:
            lease.release()

    def _read_pointer_strict(self) -> Mapping[str, object]:
        if self._profile_store is not None:
            return self._profile_store.pointer(self.layout.harness_type, self.layout.profile_id)
        return read_pointer_strict(self.layout)

    def _commit_generation(self, tree_digest: str, expected_generation: int, *, proposed_pointer: Mapping[str, object] | None = None) -> int:
        if self._profile_store is not None:
            return self._profile_store.commit_native_generation(
                self.layout.harness_type, self.layout.profile_id,
                tree_digest=tree_digest, expected_generation=expected_generation,
                proposed_pointer=proposed_pointer,
            )
        pointer = dict(self._read_pointer_strict())
        if int(pointer.get("native_state_generation", 0)) != expected_generation:
            raise ProfileNativeHomeError(PROFILE_NATIVE_HOME_DRIFT, "generation CAS failed")
        if proposed_pointer is not None:
            pointer = dict(proposed_pointer)
        else:
            pointer["native_state_generation"] = expected_generation + 1
            pointer["native_tree_digest"] = tree_digest
            pointer["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
        ensure_plain_directory(self.layout.base)
        temporary = self.layout.profile_json.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(pointer, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
        os.chmod(temporary, 0o600)
        temporary.replace(self.layout.profile_json)
        return int(pointer["native_state_generation"])

    # ------------------------------------------------------------------ #
    # failure / ambiguous handling
    # ------------------------------------------------------------------ #
    def preserve_recovery(self) -> str:
        """Keep the view under recovery/ for manual inspect/recover/discard."""
        self._active_registry.unregister(self.execution_id)
        directory = self.layout.recovery_view_dir(self.execution_id)
        ensure_plain_directory(directory.parent)
        if directory.exists():
            shutil.rmtree(directory, ignore_errors=True)
        shutil.move(str(self.root), str(directory))
        self._prune_recovery()
        return directory.name

    def discard(self) -> dict[str, object]:
        """Idempotent cleanup of the execution-scoped view root."""
        self._active_registry.unregister(self.execution_id)
        if not self.root.exists():
            return {"status": "already_cleaned"}
        shutil.rmtree(self.root, ignore_errors=True)
        return {"status": "discarded"}

    def _prune_recovery(self) -> None:
        views = sorted((p for p in self.layout.recovery.iterdir() if p.is_dir() and not p.is_symlink()), key=lambda p: p.stat().st_mtime)
        for stale in views[:-MAX_RECOVERY_VIEWS]:
            shutil.rmtree(stale, ignore_errors=True)


def _generation_after(layout: ProfileLayout) -> int:
    try:
        return int(json.loads(layout.profile_json.read_text(encoding="utf-8")).get("native_state_generation", 0))
    except (OSError, ValueError):
        return -1


def generation_of(layout: ProfileLayout) -> int:
    try:
        return int(json.loads(layout.profile_json.read_text(encoding="utf-8")).get("native_state_generation", 0))
    except (OSError, ValueError) as exc:
        raise ProfileNativeHomeError("PROFILE_POINTER_NOT_FOUND", layout.profile_id) from exc


__all__ = [
    "ActiveExecutionRegistry",
    "NativeHomeView",
    "ProfileMutationLease",
    "ReconcileReport",
    "generation_of",
]
