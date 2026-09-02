"""The only official Harness profile authority (vNext: one native home).

``profile.json`` is the ONE current pointer: reads without an explicit
revision resolve through it (never by scanning ``revisions/``); explicit
revisions read immutable envelopes; every persistent mutation is a journaled
transaction whose single visibility commit point is the pointer replacement.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from agent_box.protocols.host import ResourceLibraryDescriptor
from agent_box.work_core import ProviderDescriptor, Ref, RefType, ResourceResolutionContext

from ..native_home.failures import (
    PROFILE_MUTATION_LEASE_CONFLICT,
    PROFILE_POINTER_INVALID,
    PROFILE_POINTER_NOT_FOUND,
    PROFILE_REVISION_CONFLICT,
    ProfileNativeHomeError,
)
from ..native_home.layout import ProfileLayout
from ..native_home.migrations import MIGRATED_FROM_ENVELOPE, seed_envelope_config
from ..native_home.policy import CONFIG_AUTHORITY, FIVE_POLICIES, NativeHomePolicy
from ..native_home.failures import PROFILE_RECOVERY_REQUIRED, CommittedMutationError
from ..native_home.recovery import (
    COMPLETE_COMMIT,
    RECOVERY_REQUIRED,
    assert_no_pending,
    handle_mutation_failure,
)
from ..native_home.transaction import ProfileTransaction, write_journal
from ..native_home.tree import digest_tree
from ..native_home.view import ActiveExecutionRegistry, ProfileMutationLease
from .profile_envelope import ProfileEnvelope, to_profile_envelope

PROVIDER_ID = "harness-profile"
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")
_SECRET = re.compile(r"(secret|token|api[_-]?key|password|private[_-]?key|authorization|cookie|credential_value|host_path)", re.I)
MAX_CONFIG_BYTES = 262144

# Plugin-local mutable pointer fields are NOT part of the immutable identity
# digest: session/cache/checkpoint evolution bumps the native state
# generation without pretending to be a profile configuration revision.
_NON_IDENTITY_KEYS = frozenset({"digest", "revision", "native_state_generation", "native_tree_digest", "recovery_generation"})


def _safe(value, size=65536):
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    if len(raw.encode()) > size:
        raise ValueError("PROFILE_TOO_LARGE")
    if isinstance(value, dict):
        if len(value) > 128:
            raise ValueError("FIELD_LIMIT_EXCEEDED")
        for k, v in value.items():
            if not isinstance(k, str) or len(k) > 96 or _SECRET.search(k):
                raise ValueError("SECRET_FIELD_FORBIDDEN")
            _safe(v, size)
    elif isinstance(value, list):
        if len(value) > 128:
            raise ValueError("FIELD_LIMIT_EXCEEDED")
        for v in value:
            _safe(v, size)
    elif isinstance(value, str) and len(value) > 8192:
        raise ValueError("FIELD_TOO_LARGE")
    return value


def _digest(payload: Mapping[str, Any]) -> str:
    body = {k: v for k, v in payload.items() if k not in _NON_IDENTITY_KEYS}
    return "sha256:" + hashlib.sha256(
        json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# renderer: payload mapping -> sequence of (guest-home-relative path, bytes)
ConfigRenderer = Callable[[Mapping[str, Any]], Sequence[tuple[str, bytes]]]


def _staged_tree_digest(staged_root: Path) -> str:
    """Credential-free manifest digest over a staged snapshot (identical
    algorithm to the legacy preview digest: relative path + file sha256)."""
    import shutil as _shutil

    rows = sorted(
        (item.relative_to(staged_root).as_posix(), "file", hashlib.sha256(item.read_bytes()).hexdigest())
        for item in staged_root.rglob("*")
        if item.is_file() and not item.is_symlink()
    )
    return "sha256:" + hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _sign_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Module-level helper: compute+safe-scan the immutable envelope digest."""
    payload = dict(payload)
    payload["digest"] = _digest(payload)
    _safe(dict(payload).get("credential_source_ref"))
    return payload


class ProfileStore:
    provider_id = PROVIDER_ID
    supported_contract_ids = frozenset({ProfileEnvelope.contract_id})

    def __init__(self, root: Path, *, validator: Callable[[str, Any], None] | None = None,
                 policies: Mapping[str, NativeHomePolicy] | None = None,
                 config_renderers: Mapping[str, ConfigRenderer] | None = None) -> None:
        self.root = Path(root).resolve()
        self.validator = validator
        self._policies = dict(policies or FIVE_POLICIES)
        self._renderers = dict(config_renderers or {})
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)

    # ------------------------------------------------------------------ #
    # registry surface
    # ------------------------------------------------------------------ #
    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Harness Profile Store", "2.0")

    def library_descriptor(self) -> ResourceLibraryDescriptor:
        return ResourceLibraryDescriptor(self.provider_id, ProfileEnvelope.contract_id, "Harness Profiles", frozenset({"list", "get", "create_revision", "disable"}))

    def list_resources(self):
        return self.list()

    def get_resource(self, ref):
        return self.get(ref.metadata.get("harness_type", ""), ref.native_id, int(ref.metadata.get("revision", "0")))

    def create_revision(self, harness_type, data, expected_revision=None):
        return self.put(harness_type, data, expected_revision)

    def disable(self, harness_type, profile_id, revision):
        return self.put(harness_type, {"profile_id": profile_id, "disabled": True}, revision)

    # ------------------------------------------------------------------ #
    # layout / policy helpers
    # ------------------------------------------------------------------ #
    def layout(self, harness_type: str, profile_id: str) -> ProfileLayout:
        return ProfileLayout(self.root, harness_type, profile_id)

    def policy(self, harness_type: str) -> NativeHomePolicy:
        try:
            return self._policies[harness_type]
        except KeyError as exc:
            raise KeyError(f"NO_NATIVE_HOME_POLICY:{harness_type}") from exc

    def renderer(self, harness_type: str) -> ConfigRenderer | None:
        return self._renderers.get(harness_type)

    # ------------------------------------------------------------------ #
    # immutable envelope reads
    # ------------------------------------------------------------------ #
    def _read(self, h, p, r):
        path = self.layout(h, p).revision_dir(r) / "envelope.json"
        if path.is_symlink():
            raise ValueError("PROFILE_SYMLINK_FORBIDDEN")
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise KeyError("PROFILE_NOT_FOUND") from exc
        if value.get("digest") != _digest(value):
            raise ValueError("PROFILE_DIGEST_DRIFT")
        if value.get("harness_type") != h or value.get("profile_id") != p or int(value.get("revision", 0)) != int(r) or value.get("provider_id") != PROVIDER_ID:
            raise ValueError("PROFILE_IDENTITY_MISMATCH")
        return value

    # ------------------------------------------------------------------ #
    # current pointer authority
    # ------------------------------------------------------------------ #
    def _read_pointer(self, harness_type: str, profile_id: str) -> dict[str, Any]:
        """Strict pointer read: ONLY a missing FILE is NOT_FOUND; corrupt
        JSON, wrong identity, missing/invalid revision and bad digest shape
        are all PROFILE_POINTER_INVALID (never conflated with 'fresh')."""
        layout = self.layout(harness_type, profile_id)
        if not layout.profile_json.is_file():
            raise ProfileNativeHomeError(PROFILE_POINTER_NOT_FOUND, profile_id)
        try:
            pointer = json.loads(layout.profile_json.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise ProfileNativeHomeError(PROFILE_POINTER_INVALID, profile_id) from exc
        if not isinstance(pointer, dict):
            raise ProfileNativeHomeError(PROFILE_POINTER_INVALID, profile_id)
        if str(pointer.get("harness_type", "")) != harness_type or str(pointer.get("profile_id", "")) != profile_id:
            raise ProfileNativeHomeError(PROFILE_POINTER_INVALID, profile_id)
        revision = pointer.get("revision")
        if not isinstance(revision, int) or revision < 1:
            raise ProfileNativeHomeError(PROFILE_POINTER_INVALID, profile_id)
        if not isinstance(pointer.get("digest"), str) or not pointer["digest"].startswith("sha256:"):
            raise ProfileNativeHomeError(PROFILE_POINTER_INVALID, profile_id)
        return pointer

    def _current_envelope(self, harness_type: str, profile_id: str) -> dict[str, Any]:
        """Current = the pointer's exact revision, never a max-revision scan."""
        pointer = self._read_pointer(harness_type, profile_id)
        try:
            value = self._read(harness_type, profile_id, int(pointer["revision"]))
        except KeyError as exc:
            raise ProfileNativeHomeError(PROFILE_POINTER_INVALID, f"{profile_id}: pointer targets a missing revision") from exc
        if value["digest"] != pointer.get("digest"):
            raise ProfileNativeHomeError(PROFILE_POINTER_INVALID, f"{profile_id}: pointer/envelope digest mismatch")
        return value

    def get(self, harness_type, profile_id, revision=None):
        if revision is not None:
            return self._read(harness_type, profile_id, int(revision))
        return self._current_envelope(harness_type, profile_id)

    def pointer(self, harness_type: str, profile_id: str) -> dict[str, object]:
        return dict(self._read_pointer(harness_type, profile_id))

    def list(self, harness_type=None):
        """Enumerate identities; current resolved through each valid pointer."""
        roots = [self.root / harness_type] if harness_type else sorted(self.root.iterdir() if self.root.exists() else [], key=lambda x: x.name)
        result = []
        for hroot in roots:
            if not hroot.is_dir() or hroot.is_symlink():
                continue
            for p in sorted(hroot.iterdir(), key=lambda x: x.name):
                if not p.is_dir() or p.is_symlink():
                    continue
                try:
                    result.append(self._current_envelope(hroot.name, p.name))
                except ProfileNativeHomeError:
                    # no valid pointer: the identity is reported via
                    # pointer_problems(), never silently re-pointed to the
                    # max revision directory.
                    continue
        return tuple(result)

    def pointer_problems(self, harness_type=None) -> tuple[dict[str, str], ...]:
        """Typed diagnostics for identities whose current cannot be resolved."""
        roots = [self.root / harness_type] if harness_type else sorted(self.root.iterdir() if self.root.exists() else [], key=lambda x: x.name)
        problems: list[dict[str, str]] = []
        for hroot in roots:
            if not hroot.is_dir() or hroot.is_symlink():
                continue
            for p in sorted(hroot.iterdir(), key=lambda x: x.name):
                if not p.is_dir() or p.is_symlink():
                    continue
                try:
                    self._current_envelope(hroot.name, p.name)
                except ProfileNativeHomeError as exc:
                    problems.append({"harness_type": hroot.name, "profile_id": p.name, "code": exc.code})
        return tuple(problems)

    # ------------------------------------------------------------------ #
    # native home management (helpers used inside journaled mutations)
    # ------------------------------------------------------------------ #
    def _render_config_files(self, harness_type: str, payload: Mapping[str, Any]) -> tuple[tuple[str, bytes], ...]:
        renderer = self.renderer(harness_type)
        if renderer is None:
            return ()
        return tuple((relative, bytes(content)) for relative, content in renderer(payload) if bytes(content))


    def _apply_config_patch(self, harness_type: str, profile_id: str, rendered: Mapping[str, bytes], *, journal: ProfileTransaction) -> list[str]:
        """APPLIED step: write managed config authorities into native-home with backup."""
        layout = self.layout(harness_type, profile_id)
        policy = self.policy(harness_type)
        home = layout.native_home
        if not home.exists():
            home.mkdir(mode=0o700, parents=True)
        backup = journal.backup_dir()
        patched: list[str] = []
        for relative, content in sorted(rendered.items()):
            if policy.classify(relative) != CONFIG_AUTHORITY:
                continue
            if len(content) > MAX_CONFIG_BYTES:
                raise ProfileNativeHomeError("PROFILE_CONFIG_TOO_LARGE", relative[:128])
            target = (home / relative).resolve()
            if layout.native_home not in target.parents:
                raise ProfileNativeHomeError("PROFILE_CONFIG_PATCH_ESCAPE", relative[:128])
            if target.exists() and not target.is_file():
                raise ProfileNativeHomeError("PROFILE_CONFIG_PATH_UNSAFE", relative[:128])
            if target.exists():
                previous = backup / relative
                previous.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                from ..native_home.durable import durable_copy
                durable_copy(target, previous)
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            from ..native_home.durable import atomic_write_durable
            atomic_write_durable(target, content)
            patched.append(relative)
        return patched

    def _write_envelope_and_pointer(self, harness_type: str, profile_id: str, payload: Mapping[str, Any], *, journal: ProfileTransaction, previous_pointer: Mapping[str, Any] | None) -> None:
        """REVISION_WRITTEN + explicit pointer-intent + POINTER_COMMITTED.

        Crash-safety (frozen): the FULL proposed pointer snapshot is
        declared in the journal BEFORE the atomic replacement; recovery
        compares the actual pointer against previous/proposed, never
        against the step list.
        """
        layout = self.layout(harness_type, profile_id)
        self._write_revision_envelope(harness_type, profile_id, payload)
        journal.step("REVISION_WRITTEN", revision_written=int(payload["revision"]))
        pointer = self._pointer_from_payload(harness_type, profile_id, payload)
        journal.set_pointer_intent(pointer)
        self._write_pointer_json(layout, pointer)
        journal.step("POINTER_COMMITTED", pointer_committed=int(payload["revision"]))

    def _write_revision_envelope(self, harness_type: str, profile_id: str, payload: Mapping[str, Any]) -> None:
        """Write the immutable revision envelope (durable atomic replace)."""
        from ..native_home.durable import atomic_write_durable

        layout = self.layout(harness_type, profile_id)
        target = layout.revision_dir(int(payload["revision"]))
        target.mkdir(mode=0o700, parents=True, exist_ok=False)
        atomic_write_durable(target / "envelope.json",
                             (json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode())

    def _pointer_from_payload(self, harness_type: str, profile_id: str, payload: Mapping[str, Any]) -> dict[str, object]:
        return {
            "schema_version": 2,
            "provider_id": PROVIDER_ID,
            "profile_id": profile_id,
            "harness_type": harness_type,
            "revision": int(payload["revision"]),
            "digest": payload["digest"],
            "skill_receipts_digest": str(payload.get("skill_receipts_digest", "")),
            "native_state_generation": int(payload.get("native_state_generation", 0)),
            "native_tree_digest": str(payload.get("native_tree_digest", "")),
            "recovery_generation": int(payload.get("recovery_generation", 0)),
            "updated_at": _now(),
        }

    def _write_pointer_json(self, layout: ProfileLayout, pointer: Mapping[str, object]) -> None:
        from ..native_home.durable import _record, atomic_write_durable

        layout.base.mkdir(mode=0o700, parents=True, exist_ok=True)
        _record(f"pointer:replace:{layout.profile_id}")
        atomic_write_durable(
            layout.profile_json,
            (json.dumps(pointer, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode(),
        )

    # ------------------------------------------------------------------ #
    # mutation (journaled; pointer replacement is the only commit point)
    # ------------------------------------------------------------------ #
    def _assume_mutation_lease(self, harness_type: str, profile_id: str, owner: str) -> ProfileMutationLease:
        """Lease first, active check + pending check INSIDE the lease."""
        layout = self.layout(harness_type, profile_id)
        lease = ProfileMutationLease(layout)
        lease.acquire(owner)
        try:
            assert_no_pending(layout)
            ActiveExecutionRegistry(layout).assert_idle()
        except Exception:
            lease.release()
            raise
        return lease

    def put(self, harness_type, data, expected_revision=None):
        """Journaled config mutation; fails closed on every stage."""
        if not _ID.fullmatch(str(harness_type)):
            raise ValueError("INVALID_HARNESS_TYPE")
        if not isinstance(data, dict):
            raise TypeError("profile must be an object")
        pid = str(data.get("profile_id") or data.get("name") or "").strip()
        if not _ID.fullmatch(pid):
            raise ValueError("INVALID_PROFILE_ID")
        native = data.get("native_payload", data.get("config", {}))
        _safe(native)
        if self.validator:
            self.validator(harness_type, native)
        layout = self.layout(harness_type, pid)
        lease = self._assume_mutation_lease(harness_type, pid, "profile-put")
        journal = None
        payload = None
        try:
            journal = ProfileTransaction(
                layout, operation="profile-config",
                expected_revision=int(expected_revision) if expected_revision is not None else None,
                previous_pointer=self._read_pointer_optional(harness_type, pid),
            )
            # CAS re-read INSIDE the lease (never the pre-lease snapshot)
            previous = self._read_pointer_optional(harness_type, pid)
            current = self._current_envelope(harness_type, pid) if previous is not None else None
            actual = int(current["revision"]) if current else 0
            if expected_revision is not None and actual != int(expected_revision):
                raise ProfileNativeHomeError(PROFILE_REVISION_CONFLICT, f"{actual} != {expected_revision}")

            payload = self._build_payload(harness_type, pid, data, native, current, previous)
            # STAGED: render + persist staged config artifacts (bounded)
            rendered = {relative: content for relative, content in self._render_config_files(harness_type, native)}
            staged = journal.staged_dir()
            for relative, content in sorted(rendered.items()):
                target = staged / relative
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                from ..native_home.durable import atomic_write_durable
                atomic_write_durable(target, content)
            journal.step("STAGED")
            # APPLIED: native config patch with backup
            self._apply_config_patch(harness_type, pid, rendered, journal=journal)
            journal.step("APPLIED", applied_files=sorted(rendered))
            payload["native_tree_digest"] = digest_tree(self.policy(harness_type), layout.native_home)
            payload = _sign_payload(payload)
            # REVISION_WRITTEN + POINTER_COMMITTED
            self._write_envelope_and_pointer(harness_type, pid, payload, journal=journal, previous_pointer=previous)
            journal.commit()
            journal.cleanup_dir()
            return payload
        except Exception:
            if journal is not None:
                decision = handle_mutation_failure(layout, journal)
            else:
                decision = None
            if decision == COMPLETE_COMMIT:
                # the mutation IS committed (pointer replacement fulfilled):
                # return the successful result — never an ordinary failure
                if payload is not None:
                    return payload
                raise CommittedMutationError(
                    profile_id=pid, harness_type=harness_type,
                    committed_revision=int(journal.refresh().get("proposed_pointer", {}).get("revision", 0)),
                    committed_digest=str(journal.refresh().get("proposed_pointer", {}).get("digest", "")),
                    operation="profile-config",
                ) from None
            if decision == RECOVERY_REQUIRED:
                raise ProfileNativeHomeError(PROFILE_RECOVERY_REQUIRED, pid) from None
            raise
        finally:
            lease.release()

    def _read_pointer_optional(self, harness_type: str, profile_id: str) -> dict[str, Any] | None:
        """Fresh-profile entry guard: ONLY a genuine PROFILE_POINTER_NOT_FOUND
        (no pointer file) may mean 'fresh'.  Corrupt/invalid pointers fail
        closed so a corrupt pointer can never be misread as a new profile."""
        try:
            return self._read_pointer(harness_type, profile_id)
        except ProfileNativeHomeError as exc:
            if exc.code == PROFILE_POINTER_NOT_FOUND:
                return None
            raise

    def _build_payload(self, harness_type, pid, data, native, current, previous) -> dict[str, Any]:
        if current is not None:
            next_revision = int(current["revision"]) + 1
            skill_receipts = str(data.get("skill_receipts_digest") or current.get("skill_receipts_digest") or "")
            generation = int(previous.get("native_state_generation", 0)) if previous is not None else 0
            recovery_generation = int(previous.get("recovery_generation", 0)) if previous is not None else 0
            provenance = data.get("import_provenance") or current.get("import_provenance")
        else:
            # fresh profile or explicit envelope-only migration
            next_revision = 1
            skill_receipts = str(data.get("skill_receipts_digest") or "")
            generation = 0
            recovery_generation = 0
            provenance = data.get("import_provenance")
        return {
            "profile_id": pid,
            "harness_type": harness_type,
            "provider_id": PROVIDER_ID,
            "name": str(data.get("name") or pid)[:128],
            "schema_version": 2,
            "revision": next_revision,
            "disabled": bool(data.get("disabled", False)),
            "credential_source_ref": data.get("credential_source_ref"),
            "capability_refs": data.get("capability_refs", []),
            "session_overlay_policy": data.get("session_overlay_policy", {"mode": "execution-local"}),
            "import_provenance": provenance,
            "native_payload": native,
            "skill_receipts_digest": skill_receipts,
            "native_state_generation": generation,
            "native_tree_digest": "",
            "recovery_generation": recovery_generation,
        }

    def record_skill_mutation(self, harness_type: str, profile_id: str, receipts_digest: str, *, expected_revision: int,
                              provenance: Mapping[str, str] | None = None, _journal=None) -> dict[str, Any]:
        """Revision write for a skill mutation (files+receipts already APPLIED).

        When called from a journaled skill transaction (``_journal``), only
        the REVISION_WRITTEN + POINTER_COMMITTED steps run inside that
        transaction; otherwise this call builds its own transaction with the
        same lease/CAS rules.
        """
        current = self._current_envelope(harness_type, profile_id)
        payload = self._build_payload(
            harness_type, profile_id,
            {
                "profile_id": profile_id,
                "name": current["name"],
                "native_payload": current["native_payload"],
                "credential_source_ref": current.get("credential_source_ref"),
                "capability_refs": current.get("capability_refs", []),
                "session_overlay_policy": current.get("session_overlay_policy", {}),
                "skill_receipts_digest": receipts_digest,
                "import_provenance": {
                    **(current.get("import_provenance") or {}),
                    **({"kind": provenance["kind"]} if provenance and "kind" in provenance else {}),
                },
            },
            current["native_payload"], current=current, previous=self._read_pointer_optional(harness_type, profile_id),
        )
        if _journal is not None:
            layout_now = self.layout(harness_type, profile_id)
            payload["native_tree_digest"] = digest_tree(self.policy(harness_type), layout_now.native_home)
            payload = _sign_payload(payload)
            _journal.set_receipts_after(receipts_digest)
            self._write_revision_envelope(harness_type, profile_id, payload)
            _journal.step("REVISION_WRITTEN", revision_written=int(payload["revision"]))
            pointer = self._pointer_from_payload(harness_type, profile_id, payload)
            _journal.set_pointer_intent(pointer)
            self._write_pointer_json(self.layout(harness_type, profile_id), pointer)
            _journal.step("POINTER_COMMITTED", pointer_committed=int(payload["revision"]))
            return payload
        # standalone path: own transaction + lease (used by management ops)
        layout = self.layout(harness_type, profile_id)
        lease = self._assume_mutation_lease(harness_type, profile_id, "skill-revision")
        journal = None
        try:
            journal = ProfileTransaction(
                layout, operation="skill-revision",
                expected_revision=int(expected_revision),
                expected_generation=int(self._read_pointer_optional(harness_type, profile_id).get("native_state_generation", 0)),
                previous_pointer=self._read_pointer_optional(harness_type, profile_id),
                receipts_digest_before=self._receipts_current_digest(harness_type, profile_id),
            )
            refreshed = self._current_envelope(harness_type, profile_id)
            if int(refreshed["revision"]) != int(expected_revision):
                raise ProfileNativeHomeError(PROFILE_REVISION_CONFLICT, f"{refreshed['revision']} != {expected_revision}")
            payload = self._build_payload(
                harness_type, profile_id,
                {
                    "profile_id": profile_id,
                    "name": refreshed["name"],
                    "native_payload": refreshed["native_payload"],
                    "credential_source_ref": refreshed.get("credential_source_ref"),
                    "capability_refs": refreshed.get("capability_refs", []),
                    "session_overlay_policy": refreshed.get("session_overlay_policy", {}),
                    "skill_receipts_digest": receipts_digest,
                },
                refreshed["native_payload"], current=refreshed, previous=self._read_pointer_optional(harness_type, profile_id),
            )
            journal.step("STAGED")
            journal.step("APPLIED")
            journal.set_receipts_after(receipts_digest)
            payload["native_tree_digest"] = digest_tree(self.policy(harness_type), layout.native_home)
            payload = _sign_payload(payload)
            self._write_envelope_and_pointer(harness_type, profile_id, payload, journal=journal, previous_pointer=self._read_pointer_optional(harness_type, profile_id))
            journal.commit()
            journal.cleanup_dir()
            return payload
        except Exception:
            if journal is not None:
                decision = handle_mutation_failure(layout, journal, restore_extra=restore_receipts)
            else:
                decision = None
            if decision == COMPLETE_COMMIT:
                if payload is not None:
                    return payload
                raise CommittedMutationError(
                    profile_id=profile_id, harness_type=harness_type,
                    committed_revision=int(journal.refresh().get("proposed_pointer", {}).get("revision", 0)),
                    committed_digest=str(journal.refresh().get("proposed_pointer", {}).get("digest", "")),
                    operation="skill-revision",
                ) from None
            if decision == RECOVERY_REQUIRED:
                raise ProfileNativeHomeError(PROFILE_RECOVERY_REQUIRED, profile_id) from None
            raise
        finally:
            lease.release()

    def _receipts_current_digest(self, harness_type: str, profile_id: str) -> str:
        from ..native_home.receipts import ReceiptStore

        return ReceiptStore(self.layout(harness_type, profile_id)).digest()

    def confirm_legacy_import(self, harness_type: str, profile_id: str, source, guest_relative: str = "",
                              *, expected_preview_digest: str | None = None, expected_revision: int | None = None) -> tuple[dict[str, Any], dict[str, object]]:
        """Journaled legacy 1.x directory import (frozen transaction).

        Lease first; inside the lease: no-pending check, active-execution
        check, CAS re-read, and a re-walk of the source whose content digest
        must match the preview (zero writes before all three proofs pass).
        The files are staged guest-relative, applied with skip-on-conflict
        (existing files are never overwritten), then the revision envelope
        and the pointer commit.  Any failure rolls back files/revision/
        pointer; the legacy source is never modified and credential content
        is never read.  Provenance carries only path-free facts.
        """
        from ..native_home.failures import PROFILE_POINTER_NOT_FOUND
        from ..native_home.migrations import walk_legacy_source

        source = Path(source).expanduser().resolve()
        if not _ID.fullmatch(str(harness_type)) or not _ID.fullmatch(str(profile_id)):
            raise ProfileNativeHomeError("INVALID_PROFILE_ID", str(profile_id)[:64])
        if not source.is_dir() or source.is_symlink():
            raise ProfileNativeHomeError("LEGACY_SOURCE_DIRECTORY_REQUIRED")
        layout = self.layout(harness_type, profile_id)
        lease = self._assume_mutation_lease(harness_type, profile_id, "legacy-import")
        journal = None
        value = None
        try:
            journal = ProfileTransaction(
                layout, operation="legacy-import",
                expected_revision=int(expected_revision) if expected_revision is not None else None,
                previous_pointer=self._read_pointer_optional(harness_type, profile_id),
            )
            previous = self._read_pointer_optional(harness_type, profile_id)
            current = self._current_envelope(harness_type, profile_id) if previous is not None else None
            if current is None:
                raise ProfileNativeHomeError(PROFILE_POINTER_NOT_FOUND, profile_id)
            if expected_revision is not None and int(current["revision"]) != int(expected_revision):
                raise ProfileNativeHomeError(PROFILE_REVISION_CONFLICT, f"{current['revision']} != {expected_revision}")
            # re-verify the preview BEFORE any write
            walk, digest = walk_legacy_source(self.policy(harness_type), source, guest_relative)
            if expected_preview_digest and digest != expected_preview_digest:
                raise ProfileNativeHomeError("LEGACY_IMPORT_PREVIEW_DRIFT", digest[:24])
            home = layout.native_home
            if not home.exists():
                home.mkdir(mode=0o700, parents=True)
            # ---- staged snapshot (bounded, verified BEFORE any native write)
            # The legacy SOURCE is read exactly once, during staging; every
            # staged file is validated as a regular file and the whole staged
            # manifest digest MUST equal the preview/verified digest.  All
            # later APPLIED writes read ONLY the staged snapshot, so a
            # source mutation after staging can never mix versions.
            staged = journal.staged_dir()
            prefix = f"{guest_relative}/" if guest_relative else ""
            pending: list[tuple[str, str]] = []  # (guest-relative, raw path)
            for entry in walk.entries:
                if entry.is_dir:
                    continue
                guest_rel = entry.relative
                raw = guest_rel[len(prefix):] if prefix else guest_rel
                source_file = (source / raw).resolve()
                if source_file.parent != source and source not in source_file.parents:
                    raise ProfileNativeHomeError("LEGACY_IMPORT_PATH_ESCAPE", guest_rel[:128])
                if source_file.is_symlink() or not source_file.is_file():
                    raise ProfileNativeHomeError("LEGACY_IMPORT_UNSAFE_FILE", guest_rel[:128])
                data = source_file.read_bytes()
                destination = staged / guest_rel
                destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                from ..native_home.durable import atomic_write_durable
                atomic_write_durable(destination, data)
                try:
                    os.chmod(destination, 0o600)
                except OSError:
                    pass
                pending.append((guest_rel, raw))
            staged_digest = _staged_tree_digest(staged)
            if expected_preview_digest and staged_digest != expected_preview_digest:
                # source changed during staging -> typed fail BEFORE any
                # native-home/revision/pointer mutation (journal+staged are
                # transaction infrastructure, not profile mutations)
                raise ProfileNativeHomeError("LEGACY_IMPORT_PREVIEW_DRIFT", staged_digest[:24])
            journal.step("STAGED", staged_manifest_digest=staged_digest)
            applied: list[str] = []
            skipped_conflicts: list[str] = []
            for guest_rel, raw in pending:
                target = (home / guest_rel).resolve()
                if layout.native_home not in target.parents:
                    raise ProfileNativeHomeError("LEGACY_IMPORT_PATH_ESCAPE", guest_rel[:128])
                if target.exists():
                    skipped_conflicts.append(guest_rel)
                    continue
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                data = (staged / guest_rel).read_bytes()  # staged only, never source
                from ..native_home.durable import atomic_write_durable
                atomic_write_durable(target, data)
                try:
                    os.chmod(target, 0o600)
                except OSError:
                    pass
                if hashlib.sha256(target.read_bytes()).hexdigest() != hashlib.sha256(data).hexdigest():
                    raise ProfileNativeHomeError("LEGACY_IMPORT_APPLY_VERIFY_FAILED", guest_rel[:128])
                applied.append(guest_rel)
            journal.step("APPLIED", applied_files=applied)
            payload = self._build_payload(
                harness_type, profile_id,
                {
                    "profile_id": profile_id,
                    "name": current["name"],
                    "native_payload": current["native_payload"],
                    "credential_source_ref": current.get("credential_source_ref"),
                    "capability_refs": current.get("capability_refs", []),
                    "session_overlay_policy": current.get("session_overlay_policy", {}),
                    "import_provenance": {
                        "kind": "IMPORTED_FROM_LEGACY_DIR",
                        "source_kind": "legacy-directory",
                        "source_fingerprint": digest[:16],
                        "guest_relative": guest_relative,
                        "at": _now(),
                    },
                },
                current["native_payload"], current=current, previous=previous,
            )
            payload["native_tree_digest"] = digest_tree(self.policy(harness_type), home)
            payload = _sign_payload(payload)
            self._write_envelope_and_pointer(harness_type, profile_id, payload, journal=journal, previous_pointer=previous)
            journal.commit()
            journal.cleanup_dir()
            stats: dict[str, object] = {
                "copied": len(applied),
                "copied_paths": tuple(applied)[:128],
                "skipped": tuple((*walk.skipped, *skipped_conflicts))[:128],
                "source_untouched": True,
                "guest_relative": guest_relative,
            }
            return payload, stats
        except Exception:
            if journal is not None:
                decision = handle_mutation_failure(layout, journal)
            else:
                decision = None
            if decision == COMPLETE_COMMIT and value is not None:
                return value, stats
            if decision == RECOVERY_REQUIRED:
                raise ProfileNativeHomeError(PROFILE_RECOVERY_REQUIRED, profile_id) from None
            raise
        finally:
            lease.release()

    # ------------------------------------------------------------------ #
    # native-state pointer updates (single-file atomic = leaf commit)
    # ------------------------------------------------------------------ #
    def commit_native_generation(self, harness_type: str, profile_id: str, *, tree_digest: str, expected_generation: int,
                                 proposed_pointer: Mapping[str, Any] | None = None) -> int:
        """CAS + atomic pointer update for reconcile (must run under the lease).

        When ``proposed_pointer`` is given it must be the EXACT dict the
        caller declared as journal intent BEFORE the replacement (the
        reconcile journal and the durable pointer then agree byte-for-byte).
        """
        pointer = self._read_pointer(harness_type, profile_id)
        if int(pointer.get("native_state_generation", 0)) != int(expected_generation):
            raise ProfileNativeHomeError("PROFILE_NATIVE_HOME_DRIFT", f"generation {pointer.get('native_state_generation')} != {expected_generation}")
        if proposed_pointer is not None:
            if int(proposed_pointer.get("native_state_generation", 0)) != int(expected_generation) + 1:
                raise ProfileNativeHomeError(PROFILE_POINTER_INVALID, "proposed generation")
            if str(proposed_pointer.get("native_tree_digest", "")) != tree_digest:
                raise ProfileNativeHomeError(PROFILE_POINTER_INVALID, "proposed tree digest")
            pointer = dict(proposed_pointer)
        else:
            pointer = dict(pointer)
            pointer["native_state_generation"] = int(expected_generation) + 1
            pointer["native_tree_digest"] = tree_digest
            pointer["updated_at"] = _now()
        self._write_pointer_json(self.layout(harness_type, profile_id), pointer)
        return int(pointer["native_state_generation"])

    def mark_recovery(self, harness_type: str, profile_id: str) -> int:
        pointer = self._read_pointer(harness_type, profile_id)
        pointer = dict(pointer)
        pointer["recovery_generation"] = int(pointer.get("recovery_generation", 0)) + 1
        pointer["updated_at"] = _now()
        self._write_pointer_json(self.layout(harness_type, profile_id), pointer)
        return int(pointer["recovery_generation"])

    # ------------------------------------------------------------------ #
    # explicit envelope-only migration (never a silent max-revision scan)
    # ------------------------------------------------------------------ #
    def migrate_envelope_only(self, harness_type: str, profile_id: str) -> dict[str, Any]:
        """Explicit migration of a legacy envelope-only profile.

        The ONLY sanctioned legacy scan: the latest revision directory is
        read once as migration input, seeded into a native home and pinned
        by a freshly written pointer with ``MIGRATED_FROM_ENVELOPE``
        provenance.  Idempotent; fails closed when a pointer already exists.
        """
        if not _ID.fullmatch(str(harness_type)) or not _ID.fullmatch(str(profile_id)):
            raise ProfileNativeHomeError("INVALID_PROFILE_ID", str(profile_id)[:64])
        layout = self.layout(harness_type, profile_id)
        if layout.profile_json.exists():
            return self._current_envelope(harness_type, profile_id)
        revisions = layout.revisions
        if not revisions.is_dir():
            raise ProfileNativeHomeError(PROFILE_POINTER_NOT_FOUND, profile_id)
        numbers = [int(p.name) for p in revisions.iterdir() if p.is_dir() and not p.is_symlink() and p.name.isdigit()]
        if not numbers:
            raise ProfileNativeHomeError(PROFILE_POINTER_NOT_FOUND, profile_id)
        legacy = self._read(harness_type, profile_id, max(numbers))
        native = legacy.get("native_payload", legacy.get("config", {}))
        _safe(native)
        if self.validator:
            self.validator(harness_type, native)
        lease = self._assume_mutation_lease(harness_type, profile_id, "envelope-migration")
        journal = None
        payload = None
        try:
            journal = ProfileTransaction(
                layout, operation="envelope-migration",
                previous_pointer=None,
            )
            if layout.profile_json.exists():
                raise ProfileNativeHomeError(PROFILE_POINTER_INVALID, "already migrated")
            payload = self._build_payload(harness_type, profile_id, {
                "profile_id": profile_id,
                "name": legacy.get("name") or profile_id,
                "native_payload": native,
                "credential_source_ref": legacy.get("credential_source_ref"),
                "capability_refs": legacy.get("capability_refs", []),
                "session_overlay_policy": legacy.get("session_overlay_policy", {}),
                "import_provenance": {
                    "kind": MIGRATED_FROM_ENVELOPE,
                    "source_revision": int(legacy["revision"]),
                    "at": _now(),
                },
            }, native, current=legacy, previous=None)
            rendered = {relative: content for relative, content in self._render_config_files(harness_type, native)}
            staged = journal.staged_dir()
            for relative, content in sorted(rendered.items()):
                target = staged / relative
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                from ..native_home.durable import atomic_write_durable
                atomic_write_durable(target, content)
            journal.step("STAGED")
            self._apply_config_patch(harness_type, profile_id, rendered, journal=journal)
            journal.step("APPLIED")
            payload["native_tree_digest"] = digest_tree(self.policy(harness_type), layout.native_home)
            payload = _sign_payload(payload)
            self._write_envelope_and_pointer(harness_type, profile_id, payload, journal=journal, previous_pointer=None)
            journal.commit()
            journal.cleanup_dir()
            return payload
        except Exception:
            if journal is not None:
                decision = handle_mutation_failure(layout, journal)
            else:
                decision = None
            if decision == COMPLETE_COMMIT and payload is not None:
                return payload
            if decision == RECOVERY_REQUIRED:
                raise ProfileNativeHomeError(PROFILE_RECOVERY_REQUIRED, profile_id) from None
            raise
        finally:
            lease.release()

    # ------------------------------------------------------------------ #
    # native home summaries (credential-free, host-path-free)
    # ------------------------------------------------------------------ #
    def native_home_summary(self, harness_type: str, profile_id: str) -> dict[str, object]:
        layout = self.layout(harness_type, profile_id)
        home = layout.native_home
        if not home.exists():
            raise ProfileNativeHomeError("PROFILE_NATIVE_HOME_MISSING", profile_id)
        from ..native_home.tree import walk_tree

        walk = walk_tree(self.policy(harness_type), home)
        try:
            pointer = self._read_pointer(harness_type, profile_id)
        except ProfileNativeHomeError:
            pointer = {}
        return {
            "harness_type": harness_type,
            "profile_id": profile_id,
            "present": True,
            "file_count": len(walk.files),
            "skipped": list(walk.skipped)[:64],
            "native_state_generation": int(pointer.get("native_state_generation", 0)),
            "native_tree_digest": digest_tree(self.policy(harness_type), home),
            "revision": int(pointer.get("revision", 0)),
            "recovery_generation": int(pointer.get("recovery_generation", 0)),
        }

    def native_home_root(self, harness_type: str, profile_id: str) -> Path:
        layout = self.layout(harness_type, profile_id)
        if not layout.native_home.exists():
            raise ProfileNativeHomeError("PROFILE_NATIVE_HOME_MISSING", profile_id)
        return layout.native_home

    # ------------------------------------------------------------------ #
    # ref / resolve (exact revision/digest semantics preserved)
    # ------------------------------------------------------------------ #
    def ref(self, harness_type, profile_id, revision=None):
        v = self.get(harness_type, profile_id, revision)
        return Ref(RefType.ARTIFACT, PROVIDER_ID, profile_id, metadata={"harness_type": harness_type, "revision": str(v["revision"]), "digest": v["digest"]})

    def resolve(self, contract_id, ref, *, context: ResourceResolutionContext | None = None):
        del context
        if contract_id != ProfileEnvelope.contract_id or ref.provider != PROVIDER_ID or ref.type is not RefType.ARTIFACT:
            raise ValueError("PROFILE_REF_MISMATCH")
        h = ref.metadata.get("harness_type", "")
        value = self._read(h, ref.native_id, int(ref.metadata.get("revision", "0")))
        if value["digest"] != ref.metadata.get("digest"):
            raise ValueError("PROFILE_DIGEST_DRIFT")
        if value["disabled"]:
            raise ValueError("PROFILE_DISABLED")
        # Defense in depth: the persisted payload is re-scanned at resolve
        # time so a tampered-but-redigested envelope still cannot cross the
        # launch boundary with credential-shaped fields.
        _safe(value.get("native_payload", value.get("config", {})))
        if self.validator:
            self.validator(h, value.get("native_payload", value.get("config", {})))
        return to_profile_envelope(value, harness_type=h, provider_id=PROVIDER_ID)


def restore_receipts(layout: ProfileLayout, journal: Mapping[str, Any], directory: Path) -> None:
    """Operation-specific rollback extra: restore the previous receipt index.

    ``directory`` is the transaction directory; the previous index snapshot
    lives at ``directory/receipts.before.json`` when a skill mutation saved
    one (bounded, credential-free, guest-relative only).
    """
    from ..native_home.receipts import ReceiptStore

    snapshot = directory / "receipts.before.json"
    if not snapshot.is_file():
        return
    if journal.get("operation") not in {"skill-install", "skill-update", "skill-rollback", "skill-uninstall"}:
        return
    raw = snapshot.read_bytes()
    ReceiptStore(layout).write_bytes(raw)


__all__ = ["PROVIDER_ID", "ProfileStore", "ConfigRenderer", "restore_receipts"]
