"""Harness-owned Profile library facade over the vNext ProfileStore.

This is the management surface the Web consumes through the generic
Resource Library contribution: profile CRUD, native home summary,
installation receipts, skill inventories, and the preview/confirm legacy
import workflow.  It never understands another harness's path semantics —
everything path-related is delegated to the NativeHomePolicy/store.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

from agent_box.protocols.host import ResourceLibraryDescriptor

from ..native_home.migrations import import_source_for, preview_legacy_import
from ..native_home.policy import NativeHomePolicy


class GenericProfileManager:
    harness_id = ""

    def __init__(self, store, definition):
        self.store, self.definition = store, definition
        self.harness_id = definition.harness_type
        self._previews: dict[str, tuple[str, str]] = {}

    def descriptor(self) -> ResourceLibraryDescriptor:
        return ResourceLibraryDescriptor(
            self.harness_id, "agent-box.profile@1", self.definition.display_name,
            frozenset({"list", "get", "create_revision", "disable", "import", "install", "inventory"}),
        )

    # ------------------------------------------------------------------ #
    # profile CRUD (envelope semantics preserved)
    # ------------------------------------------------------------------ #
    def list_resources(self):
        return tuple(self.store.list(self.harness_id))

    def get_resource(self, ref):
        return self.store.get(self.harness_id, ref.native_id, int(ref.metadata.get("revision", "0")))

    def list_profiles(self):
        return self.list_resources()

    def get_profile(self, profile_id, revision=None):
        return self.store.get(self.harness_id, profile_id, revision)

    def create_revision(self, data, expected_revision=None):
        # CAS must be REAL: the expected revision flows into the store put
        return self.store.put(self.harness_id, data, expected_revision)

    def create(self, data):
        return self.store.put(self.harness_id, data)

    def update(self, profile_id, data, expected_revision):
        return self.store.put(self.harness_id, {**data, "profile_id": profile_id}, expected_revision)

    def disable(self, profile_id, revision):
        return self.update(profile_id, {"disabled": True}, revision)

    def validate(self, body: Mapping[str, Any]) -> dict[str, object]:
        from ..adapters import ADAPTERS

        adapter = ADAPTERS[self.definition.driver]
        payload = body.get("native_payload", body.get("config", {}))
        diagnostics = adapter.validate_native_payload(payload)
        return {"valid": True, "diagnostics": tuple(diagnostics)}

    def projection_preview(self, profile_id: str, revision) -> dict[str, object]:
        """Render-only preview of the managed native config (never writes)."""
        from ..adapters import ADAPTERS

        value = self.store.get(self.harness_id, profile_id, revision)
        adapter = ADAPTERS[self.definition.driver]
        payload = value.get("native_payload", {})
        candidates = adapter.render_native_config(payload)
        return {
            "profile_id": profile_id,
            "revision": int(value["revision"]),
            "guest_files": sorted(candidate.guest_path for candidate in candidates),
            "count": len(candidates),
        }

    # ------------------------------------------------------------------ #
    # native home (vNext surface)
    # ------------------------------------------------------------------ #
    def policy(self) -> NativeHomePolicy:
        return self.store.policy(self.harness_id)

    def native_home_summary(self, profile_id: str) -> dict[str, object]:
        return self.store.native_home_summary(self.harness_id, profile_id)

    def installations(self, profile_id: str) -> dict[str, object]:
        from ..native_home.receipts import ReceiptStore

        layout = self.store.layout(self.harness_id, profile_id)
        receipts = ReceiptStore(layout).list()
        return {
            "profile_id": profile_id,
            "harness_type": self.harness_id,
            "installations": [receipt.public() for receipt in receipts],
        }

    def profile_skill_inventory(self, profile_id: str) -> dict[str, object]:
        from ..native_home.inventory import profile_skill_inventory

        layout = self.store.layout(self.harness_id, profile_id)
        return profile_skill_inventory(self.store, layout, self.policy()).public()

    def effective_skill_inventory(self, profile_id: str | None = None, workspace_root: str | None = None) -> dict[str, object]:
        from ..native_home.inventory import effective_skill_inventory

        layout = self.store.layout(self.harness_id, profile_id) if profile_id else None
        workspace = Path(workspace_root).resolve() if workspace_root else None
        return effective_skill_inventory(
            self.store, layout, self.policy(), workspace_root=workspace,
        ).public()

    # ------------------------------------------------------------------ #
    # legacy 1.x import workflow (preview -> confirm; source never deleted)
    # ------------------------------------------------------------------ #
    def import_sources(self):
        # frozen: no host-absolute paths in public API output; the canonical
        # guest mapping plus a stable source token is all that is exposed.
        _, guest_relative = import_source_for(self.harness_id)
        return ({"source_type": "legacy-directory", "source_id": "default", "guest_relative": guest_relative},)

    def import_candidates(self, source_type: str, root: Path):
        del root  # root is a user INPUT; it is never echoed back
        if source_type != "legacy-directory":
            return {"candidates": []}
        _, guest_relative = import_source_for(self.harness_id)
        return {"candidates": [{"source_id": "default", "guest_relative": guest_relative}]}

    def import_preview(self, source_type: str, root: Path, source_id: str):
        if source_type != "legacy-directory" or source_id != "default":
            raise KeyError("IMPORT_SOURCE_NOT_FOUND")
        policy = self.policy()
        preview = preview_legacy_import(policy, Path(root))
        token = os.urandom(16).hex()
        self._previews[token] = (str(Path(root).expanduser().resolve()), preview.guest_relative)
        return {"preview_id": token, **preview.public()}

    def confirm_import(self, body: Mapping[str, Any], expected_revision=None) -> dict[str, object]:
        preview_id = str(body.get("preview_id", ""))
        stashed = self._previews.pop(preview_id, None)
        if stashed is None:
            raise KeyError("IMPORT_PREVIEW_NOT_FOUND")
        source, guest_relative = stashed
        try:
            current = self.store.get(self.harness_id, body["profile_id"])
        except KeyError as exc:
            raise KeyError("PROFILE_NOT_FOUND") from exc
        profile_id = str(body["profile_id"])
        expected_preview_digest = str(body.get("preview_digest") or "")
        value, stats = self.store.confirm_legacy_import(
            self.harness_id, profile_id, Path(source), guest_relative,
            expected_preview_digest=expected_preview_digest or None,
            expected_revision=expected_revision if expected_revision is not None else current["revision"],
        )
        return {"profile": value, "stats": stats}


__all__ = ["GenericProfileManager"]