"""ProfileSkillInstaller: transactional central Skill installation into a Profile.

The frozen chain (this repair round):

    acquire mutation lease -> assert no pending journal + no active execution
    INSIDE the lease -> re-CAS the current Profile revision ->
    resolve exact central SkillRef -> validate content/inventory ->
    validate Harness compatibility -> compute native target ->
    preview conflicts -> STAGED (files) -> APPLIED (files + receipts snapshot/
    update with backup) -> record_skill_mutation (REVISION_WRITTEN +
    POINTER_COMMITTED — the visibility commit) -> COMMITTED -> cleanup.

Every step is journaled through the unified ``ProfileTransaction``; any
failure rolls back files, the previous receipt snapshot (or absence), the
revision dir, the pointer and the receipts digest.  Recovery re-entry is
idempotent and only ever "commits" a journal after pointer/revision/receipt
verification (never files+receipts+old revision).

Rules enforced here (frozen): default copy/materialization; no Skill scripts
execute; unmanaged and Profile-local targets are never overwritten; one
mutation writer per profile; one managed installation per native target;
central revisions never auto-propagate; uninstall deletes only
receipt-owned files with a recoverable backup.

The installer never imports the Skills plugin: it consumes a typed content
port (``SkillSource``) built from the Root ``AgentSkillV1`` contract and a
host path, and verifies the source tree against the central digest.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence

from .failures import (
    CommittedMutationError,
    PROFILE_REVISION_CONFLICT,
    SKILL_INSTALL_DIGEST_MISMATCH,
    SKILL_INSTALL_DRIFTED,
    SKILL_INSTALL_INCOMPATIBLE,
    SKILL_INSTALL_RECOVERY_REQUIRED,
    SKILL_INSTALL_ROLLBACK_FAILED,
    SKILL_INSTALL_TARGET_CONFLICT,
    SKILL_INSTALL_UNMANAGED_TARGET,
    ProfileNativeHomeError,
    SkillInstallError,
)
from .layout import ProfileLayout
from .policy import SKILL, NativeHomePolicy
from .receipts import (
    INSTALLED,
    ProfileSkillInstallation,
    ReceiptStore,
    now,
)
from .recovery import COMPLETE_COMMIT, RECOVERY_REQUIRED as _RECOVERY_DECISION, handle_mutation_failure, recover_pending
from .transaction import ProfileTransaction, pending_journals
from .view import ActiveExecutionRegistry, ProfileMutationLease

MAX_SKILL_FILES = 128
MAX_SKILL_BYTES = 8 * 1024 * 1024


@dataclass(frozen=True)
class SkillSource:
    """Typed content port of one resolved central Skill (never the plugin)."""

    skill_id: str
    revision: int
    digest: str
    files: tuple[Mapping[str, object], ...]
    source_path: Path

    def __post_init__(self) -> None:
        if not self.skill_id or len(self.skill_id) > 96 or "\0" in self.skill_id:
            raise SkillInstallError(SKILL_INSTALL_DIGEST_MISMATCH, "invalid skill id")
        if self.revision < 1 or not self.digest.startswith("sha256:"):
            raise SkillInstallError(SKILL_INSTALL_DIGEST_MISMATCH, "invalid revision/digest")
        if not isinstance(self.source_path, Path) or self.source_path.is_symlink():
            raise SkillInstallError(SKILL_INSTALL_DIGEST_MISMATCH, "source path unavailable")
        if not self.files:
            raise SkillInstallError(SKILL_INSTALL_DIGEST_MISMATCH, "empty inventory")
        if len(self.files) > MAX_SKILL_FILES:
            raise SkillInstallError(SKILL_INSTALL_DIGEST_MISMATCH, "too many files")

    @property
    def inventory(self) -> Mapping[str, tuple[int, str]]:
        return {
            str(item["path"]): (int(item.get("size", 0)), str(item.get("sha256", "")).removeprefix("sha256:"))
            for item in self.files
        }


def skill_source_from_contract(contract, source_path: Path) -> SkillSource:
    """Build a typed port from the Root AgentSkillV1 contract + host path."""
    return SkillSource(
        skill_id=str(contract.skill_id),
        revision=int(contract.revision),
        digest=str(contract.digest),
        files=tuple(contract.files),
        source_path=Path(source_path),
    )


def restore_skill_receipts(layout: ProfileLayout, journal: Mapping[str, Any], directory: Path) -> None:
    """Operation-specific rollback extra: restore the previous receipt index."""
    snapshot = directory / "receipts.before.json"
    if not snapshot.is_file():
        return
    raw = snapshot.read_bytes()
    ReceiptStore(layout).restore_bytes(raw)


class ProfileSkillInstaller:
    """One transaction-gated installer over one Profile."""

    def __init__(self, store, harness_type: str, profile_id: str) -> None:
        self.store = store
        self.harness_type = harness_type
        self.profile_id = profile_id
        self.layout = store.layout(harness_type, profile_id)
        self.policy: NativeHomePolicy = store.policy(harness_type)
        self.receipts = ReceiptStore(self.layout)

    # ------------------------------------------------------------------ #
    # targets and inspection
    # ------------------------------------------------------------------ #
    def target_dir(self, skill_id: str) -> Path:
        root = self.policy.skill_targets[0]
        target = (self.layout.native_home / root / skill_id).resolve()
        if self.layout.native_home not in target.parents or target == self.layout.native_home:
            raise SkillInstallError(SKILL_INSTALL_INCOMPATIBLE, "target escapes the native home")
        if self.policy.classify(f"{root}/{skill_id}") != SKILL:
            raise SkillInstallError(SKILL_INSTALL_INCOMPATIBLE, "target is not a skill root")
        return target

    def managed_tree_digest(self, target: Path, files: Sequence[str]) -> str:
        """Credential-free digest over an explicit managed file set."""
        rows: list[tuple[str, str, str]] = []
        for relative in sorted(files):
            item = (target / relative).resolve()
            if self.layout.native_home not in item.parents or item.is_symlink() or not item.is_file():
                raise SkillInstallError(SKILL_INSTALL_DRIFTED, relative)
            rows.append((relative, "file", hashlib.sha256(item.read_bytes()).hexdigest()))
        return "sha256:" + hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    def inspect(self, skill_id: str, *, central_latest: int | None = None) -> dict[str, object]:
        """Receipt + computed state (DRIFTED / UPDATE_AVAILABLE / DISABLED)."""
        receipt = self.receipts.get(skill_id)
        if receipt is None:
            return {"installed": False, "skill_id": skill_id, "state": "NOT_INSTALLED"}
        state = INSTALLED
        detail = ""
        if not self.layout.native_home.exists():
            from .failures import PROFILE_NATIVE_HOME_MISSING

            state = "NATIVE_HOME_MISSING"
            detail = PROFILE_NATIVE_HOME_MISSING
        else:
            target = self.target_dir(skill_id)
            actual = self.managed_tree_digest(target, receipt.managed_files) if target.is_dir() else ""
            if actual != receipt.installed_tree_digest:
                state = "DRIFTED"
                detail = SKILL_INSTALL_DRIFTED
        if state == INSTALLED and central_latest is not None and central_latest > receipt.central_revision:
            state = "UPDATE_AVAILABLE"
            detail = f"central r{central_latest} available"
        return {
            "installed": True,
            "skill_id": skill_id,
            "state": state,
            "detail": detail,
            "receipt": receipt.public(),
        }

    # ------------------------------------------------------------------ #
    # previews (pure)
    # ------------------------------------------------------------------ #
    def preview_install(self, source: SkillSource) -> dict[str, object]:
        receipt = self.receipts.get(source.skill_id)
        target = self.target_dir(source.skill_id)
        conflicts: list[str] = []
        unmanaged: list[str] = []
        existing: dict[str, str] = {}
        if target.is_dir():
            for item in sorted(target.rglob("*")):
                if item.is_dir() or item.is_symlink():
                    continue
                existing[item.relative_to(target).as_posix()] = hashlib.sha256(item.read_bytes()).hexdigest()
        inventory = source.inventory
        managed = set(receipt.managed_files) if receipt is not None else set()
        for path, (size, digest) in inventory.items():
            prior = existing.get(path)
            if prior is not None and prior != digest and path not in managed:
                conflicts.append(path)
        for path in existing:
            if path not in inventory:
                unmanaged.append(path)
        return {
            "skill_id": source.skill_id,
            "revision": source.revision,
            "digest": source.digest,
            "native_target": f"{self.policy.skill_targets[0]}/{source.skill_id}",
            "file_count": len(inventory),
            "conflicts": tuple(sorted(conflicts))[:128],
            "unmanaged": tuple(sorted(unmanaged))[:128],
            "already_installed": receipt is not None,
            "harness_compatible": True,
            "compatibility_notes": ("target_is_evidence_backed_skill_root",),
        }

    # ------------------------------------------------------------------ #
    # mutations (unified journaled transactions)
    # ------------------------------------------------------------------ #
    def install(self, source: SkillSource, *, expected_revision: int) -> ProfileSkillInstallation:
        if self.receipts.get(source.skill_id) is not None:
            raise SkillInstallError(SKILL_INSTALL_TARGET_CONFLICT, f"{source.skill_id} already installed")
        return self._mutate("skill-install", source, expected_revision=expected_revision)

    def update(self, source: SkillSource, *, expected_revision: int) -> ProfileSkillInstallation:
        return self._mutate("skill-update", source, expected_revision=expected_revision)

    def rollback(self, skill_id: str, source: SkillSource, *, expected_revision: int) -> ProfileSkillInstallation:
        if source.skill_id != skill_id:
            raise SkillInstallError(SKILL_INSTALL_DIGEST_MISMATCH, "rollback source mismatch")
        return self._mutate("skill-rollback", source, expected_revision=expected_revision)

    def remove(self, skill_id: str, *, expected_revision: int) -> dict[str, object]:
        """Uninstall: deletes only receipt-owned files, recoverable backup, idempotent."""
        receipt = self.receipts.get(skill_id)
        if receipt is None:
            return {"status": "already_absent", "skill_id": skill_id}
        lease, journal = self._begin_mutation("skill-uninstall", expected_revision)
        try:
            self._verify_revision(journal)
            target = self.target_dir(skill_id)
            actual = self.managed_tree_digest(target, receipt.managed_files) if target.is_dir() else ""
            if actual != receipt.installed_tree_digest:
                raise SkillInstallError(SKILL_INSTALL_DRIFTED, f"{skill_id} was manually modified")
            backup = journal.backup_dir()
            self._copy_target_to_backup(target, backup)
            journal.step("STAGED")
            journal.step("APPLIED", target_relative=self.policy.skill_targets[0] + "/" + skill_id, applied_files=[])
            for relative in sorted(receipt.managed_files):
                candidate = (target / relative).resolve()
                if self.layout.native_home not in candidate.parents:
                    raise SkillInstallError(SKILL_INSTALL_UNMANAGED_TARGET, relative)
                if candidate.exists():
                    candidate.unlink()
            self._prune_empty(target)
            self.receipts.remove(skill_id)
            self._bump_revision(receipts_digest=self.receipts.digest(), journal=journal,
                                provenance={"kind": "uninstall", "skill_id": skill_id})
            journal.commit()
            journal.cleanup_dir(keep_backup=True)  # recoverable delete backup
            return {"status": "removed", "skill_id": skill_id, "profile_revision": expected_revision + 1}
        except Exception:
            decision = self._rollback(journal)
            if decision == COMPLETE_COMMIT:
                return {"status": "removed_committed", "skill_id": skill_id,
                        "profile_revision": expected_revision + 1}
            if decision == _RECOVERY_DECISION:
                raise SkillInstallError(SKILL_INSTALL_RECOVERY_REQUIRED, journal.txid) from None
            raise
        finally:
            lease.release()

    # ------------------------------------------------------------------ #
    # transaction core
    # ------------------------------------------------------------------ #
    def _begin_mutation(self, operation: str, expected_revision: int) -> tuple[ProfileMutationLease, ProfileTransaction]:
        """Lease first; pending + active checks INSIDE the lease; fresh journal."""
        lease = ProfileMutationLease(self.layout)
        lease.acquire(f"installer:{operation}")
        try:
            ActiveExecutionRegistry(self.layout).assert_idle()
            pending = pending_journals(self.layout)
            if pending:
                txids = ",".join(str(p.get("txid", "?")) for p in pending[:4])
                raise SkillInstallError(SKILL_INSTALL_RECOVERY_REQUIRED, txids)
            # installers only ever mutate EXISTING profiles: the pointer
            # must be present AND valid (corrupt/missing fail closed typed)
            previous_pointer = self.store.pointer(self.harness_type, self.profile_id)
            journal = ProfileTransaction(
                self.layout, operation=operation, expected_revision=int(expected_revision),
                expected_generation=int(previous_pointer.get("native_state_generation", 0)),
                previous_pointer=previous_pointer,
                receipts_digest_before=self.receipts.digest(),
            )
            snapshot = journal.directory / "receipts.before.json"
            journal.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            snapshot.write_bytes(self.receipts.index_bytes())
            return lease, journal
        except Exception:
            lease.release()
            raise

    def _verify_revision(self, journal: ProfileTransaction) -> None:
        # CAS re-read INSIDE the lease (never a pre-lease snapshot)
        current = self.store.get(self.harness_type, self.profile_id)
        expected = journal.expected_revision
        if expected is not None and int(current["revision"]) != int(expected):
            raise ProfileNativeHomeError(PROFILE_REVISION_CONFLICT, f"{int(current['revision'])} != {expected}")

    def _mutate(self, operation: str, source: SkillSource, *, expected_revision: int) -> ProfileSkillInstallation:
        lease, journal = self._begin_mutation(operation, expected_revision)
        target: Path | None = None
        receipt = None
        try:
            self._verify_revision(journal)
            self._verify_source(source)
            target = self.target_dir(source.skill_id)
            self._verify_target(operation, source, target)
            delta = self._verify_target(operation, source, target)
            staged = self._stage(source, journal)
            journal.step("STAGED")
            backup = journal.backup_dir()
            self._backup_target_files(target, backup)
            self._remove_delta_files(target, delta["removed"])
            self._replace(staged, target)
            journal.step("APPLIED", target_relative=f"{self.policy.skill_targets[0]}/{source.skill_id}",
                         applied_files=[f"{self.policy.skill_targets[0]}/{source.skill_id}/{path}" for path in sorted(source.inventory)])
            installed_digest = self.managed_tree_digest(target, tuple(source.inventory))
            receipt = ProfileSkillInstallation(
                profile_id=self.profile_id,
                harness_type=self.harness_type,
                profile_revision=expected_revision + 1,
                skill_id=source.skill_id,
                central_revision=source.revision,
                central_digest=source.digest,
                installed_tree_digest=installed_digest,
                native_target=f"{self.policy.skill_targets[0]}/{source.skill_id}",
                managed_files=tuple(sorted(source.inventory)),
                state=INSTALLED,
                installed_at=now(),
                provenance={"operation": operation, "central_digest": source.digest},
            )
            self.receipts.put(receipt)
            self._bump_revision(receipts_digest=self.receipts.digest(), journal=journal,
                                provenance={"kind": operation, "skill_id": source.skill_id})
            journal.commit()
            journal.cleanup_dir()
            return receipt
        except Exception:
            decision = self._rollback(journal)
            if decision == COMPLETE_COMMIT:
                if receipt is not None:
                    return receipt
                raise CommittedMutationError(
                    profile_id=self.profile_id, harness_type=self.harness_type,
                    committed_revision=int(journal.refresh().get("proposed_pointer", {}).get("revision", 0)),
                    committed_digest=str(journal.refresh().get("proposed_pointer", {}).get("digest", "")),
                    operation=operation,
                ) from None
            if decision == _RECOVERY_DECISION:
                raise SkillInstallError(SKILL_INSTALL_RECOVERY_REQUIRED, journal.txid) from None
            raise
        finally:
            lease.release()

    def _rollback(self, journal: ProfileTransaction) -> str:
        """Runtime-failure path — the SAME decision table as crash recovery.

        Returns the typed decision; a fulfilled pointer commit is closed
        COMMITTED and NEVER re-raised as an ordinary failure by the caller.
        """
        try:
            return handle_mutation_failure(self.layout, journal, restore_extra=restore_skill_receipts)
        except ProfileNativeHomeError as exc:
            if exc.code == SKILL_INSTALL_ROLLBACK_FAILED:
                raise
            raise SkillInstallError(SKILL_INSTALL_RECOVERY_REQUIRED, journal.txid) from exc

    def _verify_source(self, source: SkillSource) -> None:
        if not source.source_path.is_dir() or source.source_path.is_symlink():
            raise SkillInstallError(SKILL_INSTALL_DIGEST_MISMATCH, "source directory required")
        inventory = source.inventory
        total = 0
        for path, (size, digest) in inventory.items():
            candidate = (source.source_path / path).resolve()
            if source.source_path not in candidate.parents:
                raise SkillInstallError(SKILL_INSTALL_DIGEST_MISMATCH, "source path escape")
            if candidate.is_symlink() or not candidate.is_file():
                raise SkillInstallError(SKILL_INSTALL_DIGEST_MISMATCH, path)
            data = candidate.read_bytes()
            total += len(data)
            if total > MAX_SKILL_BYTES:
                raise SkillInstallError(SKILL_INSTALL_DIGEST_MISMATCH, "source too large")
            actual = hashlib.sha256(data).hexdigest()
            if actual != digest or len(data) != size:
                raise SkillInstallError(SKILL_INSTALL_DIGEST_MISMATCH, path)

    def _verify_target(self, operation: str, source: SkillSource, target: Path) -> dict[str, object]:
        """Validate the native target for one mutation; returns the delta.

        Frozen inventory-delta semantics for update/rollback:
          * the OLD receipt's managed_files are the old managed authority;
          * drift is adjudicated against the ENTIRE old managed set using
            the receipt's installed evidence digest;
          * files in the target that belong to NEITHER the old managed set
            NOR the new inventory are unmanaged -> fail closed;
          * ADDED files (new inventory, not old managed) must not collide
            with an existing unmanaged target file.
        """
        receipt = self.receipts.get(source.skill_id)
        inventory = set(source.inventory)
        existing: dict[str, str] = {}
        if target.is_dir():
            for item in sorted(target.rglob("*")):
                if item.is_dir():
                    continue
                if item.is_symlink():
                    raise SkillInstallError(SKILL_INSTALL_UNMANAGED_TARGET, "symlink in target")
                existing[item.relative_to(target).as_posix()] = hashlib.sha256(item.read_bytes()).hexdigest()
        if operation == "skill-install":
            if existing:
                raise SkillInstallError(SKILL_INSTALL_TARGET_CONFLICT, "native target is not empty")
            return {"retained": set(), "added": inventory, "removed": set()}
        # update / rollback
        if receipt is None:
            raise SkillInstallError(SKILL_INSTALL_TARGET_CONFLICT, "no managed installation to update")
        if target.is_dir():
            actual = self.managed_tree_digest(target, receipt.managed_files)
        else:
            actual = ""
        if actual != receipt.installed_tree_digest:
            raise SkillInstallError(SKILL_INSTALL_DRIFTED, "managed skill was manually modified")
        old_managed = set(receipt.managed_files)
        unknown = set(existing) - old_managed - inventory
        if unknown:
            raise SkillInstallError(SKILL_INSTALL_UNMANAGED_TARGET, ",".join(sorted(unknown)[:4]))
        added = inventory - old_managed
        collisions = added & set(existing)  # present but NOT old-managed
        if collisions:
            raise SkillInstallError(SKILL_INSTALL_UNMANAGED_TARGET, ",".join(sorted(collisions)[:4]))
        retained = old_managed & inventory
        removed = old_managed - inventory
        return {"retained": retained, "added": added, "removed": removed}

    def _stage(self, source: SkillSource, journal: ProfileTransaction) -> Path:
        staged_root = journal.staged_dir()
        inventory = source.inventory
        for path, (size, digest) in inventory.items():
            # staged files live at guest-home-relative paths so recovery can
            # replay them deterministically against the backup
            destination = staged_root / self.policy.skill_targets[0] / source.skill_id / path
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            data = (source.source_path / path).read_bytes()
            if hashlib.sha256(data).hexdigest() != digest:
                raise SkillInstallError(SKILL_INSTALL_DIGEST_MISMATCH, path)
            from .durable import atomic_write_durable
            atomic_write_durable(destination, data)
        return staged_root

    def _copy_target_to_backup(self, target: Path, backup_root: Path) -> None:
        """Uninstall: full recoverable copy of the target into the backup."""
        if not target.is_dir():
            return
        destination = backup_root / self.policy.skill_targets[0] / target.name
        shutil.copytree(target, destination)

    def _backup_target_files(self, target: Path, backup_root: Path) -> None:
        """APPLIED helper: copy existing target files under backup/<guest-relative>."""
        if not target.is_dir():
            return
        root = self.policy.skill_targets[0] + "/" + target.name
        for item in sorted(target.rglob("*")):
            if item.is_dir() or item.is_symlink():
                continue
            relative = f"{root}/{item.relative_to(target).as_posix()}"
            destination = (backup_root / relative).resolve()
            if backup_root not in destination.parents:
                raise SkillInstallError(SKILL_INSTALL_UNMANAGED_TARGET, relative)
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            from .durable import durable_copy
            durable_copy(item, destination)

    def _remove_delta_files(self, target: Path, removed: set) -> None:
        """REMOVED files are deleted only when the old managed set still
        matches the receipt's installed evidence (verified above): that
        aggregate match proves the removed content is the old managed
        content, never unknown/unmanaged data."""
        for relative in sorted(removed):
            candidate = (target / relative).resolve()
            if self.layout.native_home not in candidate.parents:
                raise SkillInstallError(SKILL_INSTALL_UNMANAGED_TARGET, relative)
            if candidate.exists():
                from .durable import remove_durable
                remove_durable(candidate)

    def _replace(self, staged: Path, target: Path) -> None:
        target.mkdir(mode=0o700, parents=True, exist_ok=True)
        for item in sorted(staged.rglob("*")):
            if item.is_dir():
                continue
            guest_relative = item.relative_to(staged).as_posix()
            destination = (self.layout.native_home / guest_relative).resolve()
            if self.layout.native_home not in destination.parents:
                raise SkillInstallError(SKILL_INSTALL_UNMANAGED_TARGET, guest_relative)
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            # copy (not move): the staged tree stays as the transaction's
            # file manifest for deterministic rollback/recovery
            from .durable import durable_copy
            durable_copy(item, destination)

    def _bump_revision(self, *, receipts_digest: str, journal: ProfileTransaction, provenance: Mapping[str, str]) -> None:
        self.store.record_skill_mutation(
            self.harness_type, self.profile_id, receipts_digest,
            expected_revision=int(journal.expected_revision), provenance=provenance,
            _journal=journal,
        )

    def _prune_empty(self, target: Path) -> None:
        if not target.is_dir():
            return
        for item in sorted(target.rglob("*"), key=lambda p: len(p.parts), reverse=True):
            if item.is_dir() and not any(item.iterdir()):
                item.rmdir()
        if not any(target.iterdir()):
            target.rmdir()

    # ------------------------------------------------------------------ #
    # recovery
    # ------------------------------------------------------------------ #
    def recover_pending(self) -> list[dict[str, object]]:
        """Idempotent recovery over every incomplete journal (fail closed)."""
        receipts_digest = self.receipts.digest()
        return recover_pending(self.layout, restore_extra=restore_skill_receipts, receipts_digest=receipts_digest)


__all__ = ["ProfileSkillInstaller", "SkillSource", "skill_source_from_contract"]
