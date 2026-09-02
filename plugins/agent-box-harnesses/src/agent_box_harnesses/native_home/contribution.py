"""Typed installer contribution exposed to the Web through the generic Catalog.

The contribution owns NO Skill content authority and imports NO plugin: the
Web hands it a resolved content port (``SkillSource``) plus a Profile, and
the per-Harness ``ProfileSkillInstaller`` runs the transaction.  The Web
never writes native files directly.
"""
from __future__ import annotations

from typing import Any, Mapping

from .installer import ProfileSkillInstaller, SkillSource


class SkillInstallerContribution:
    """One Harness's install surface, discovered by ``SKILL_INSTALLER_KIND``."""

    kind = "agent-box.harness.skill-installer@1"

    def __init__(self, store, harness_type: str) -> None:
        self.store = store
        self.harness_type = harness_type
        self.id = f"{harness_type}.skill-installer"

    def _installer(self, profile_id: str) -> ProfileSkillInstaller:
        return ProfileSkillInstaller(self.store, self.harness_type, profile_id)

    def preview(self, profile_id: str, source: SkillSource) -> dict[str, object]:
        return self._installer(profile_id).preview_install(source)

    def install(self, profile_id: str, source: SkillSource, expected_revision: int) -> dict[str, object]:
        return self._installer(profile_id).install(source, expected_revision=expected_revision).public()

    def update(self, profile_id: str, source: SkillSource, expected_revision: int) -> dict[str, object]:
        return self._installer(profile_id).update(source, expected_revision=expected_revision).public()

    def rollback(self, profile_id: str, skill_id: str, source: SkillSource, expected_revision: int) -> dict[str, object]:
        return self._installer(profile_id).rollback(skill_id, source, expected_revision=expected_revision).public()

    def remove(self, profile_id: str, skill_id: str, expected_revision: int) -> dict[str, object]:
        return self._installer(profile_id).remove(skill_id, expected_revision=expected_revision)

    def inspect(self, profile_id: str, skill_id: str) -> dict[str, object]:
        return self._installer(profile_id).inspect(skill_id)

    def list_installed(self, profile_id: str) -> dict[str, object]:
        from .receipts import ReceiptStore

        installer = self._installer(profile_id)
        return {
            "harness_type": self.harness_type,
            "profile_id": profile_id,
            "installations": [receipt.public() for receipt in ReceiptStore(installer.layout).list()],
        }

    def recover(self, profile_id: str) -> dict[str, object]:
        outcomes = self._installer(profile_id).recover_pending()
        return {"harness_type": self.harness_type, "profile_id": profile_id, "outcomes": outcomes}


def as_skill_source(contract, source_path: Any) -> SkillSource:
    from .installer import skill_source_from_contract

    return skill_source_from_contract(contract, source_path)


__all__ = ["SkillInstallerContribution", "as_skill_source"]