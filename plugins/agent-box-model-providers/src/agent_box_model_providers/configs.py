"""The harness-scoped HarnessProviderConfig store: immutable revision streams.

Layer 2 of the user's two-layer model — the ONLY layer that enters
Execution Bindings.  A config is the execution-facing, harness-scoped
projection derived (explicitly) from a user-view ProviderAccount:

- JSON file ``AGENT_BOX_HOME/harness-provider-configs.json``, written
  atomically (0600 temp file + fsync + ``os.replace``) under a lock;
  at most 64 configs;
- every accepted write creates a NEW immutable revision: ``revision`` is a
  per-config monotonic counter and ``digest`` is the sha256 over the
  canonical full revision record, computed at write time.  Revisions are
  never rewritten or removed (except with their whole config);
- ``get(config_id, revision=None)`` reads the stored per-config current
  pointer for ``None`` and the exact revision otherwise — NEVER a
  max-scan;
- :meth:`get_ref` freezes the exact revision into a work-core
  ``Ref(ARTIFACT, "harness-model-providers", "<config_id>/revisions/<n>")``
  whose metadata carries ``revision``, ``digest`` and ``harness_type``;
- :meth:`resolve` re-materializes the contract value for the EXACT
  revision and fails closed on unknown ids, unknown revisions, harness
  mismatches and digest mismatches;
- deletion is guarded by turn-Binding references: any Binding whose
  ``model_provider_ref`` names one of this config's revisions blocks
  deletion (409 CONFIG_IN_USE) unless an explicit live
  ``replacement_config_id`` is named.  The scan uses ONLY the public
  session store API and ONLY ``binding.model_provider_ref`` — never
  ``Binding.extra``.

Credential values stay behind :class:`.credentials.CredentialAuthority`;
this store embeds one so probes can wire the value at probe time and so
the thin REST layer can manage values through a single authority.
"""
from __future__ import annotations

import hashlib
import json
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional

from agent_box.resource_contracts import HarnessModelProviderV1
from agent_box.work_core import Ref, RefType

from .credentials import CredentialAuthority, provider_id_from_locator
from .errors import ProviderAuthorityError
from .probe import run_probe
from .references import find_config_references
from .validation import (
    PROVIDER_ID,
    FieldValidationError,
    validate_account_locator,
    validate_base_url,
    validate_config_id,
    validate_credential_locator,
    validate_harness_type,
    validate_model_entries,
    validate_protocol_family,
    validate_projection,
)

STORE_FILENAME = "harness-provider-configs.json"
SCHEMA_VERSION = 1
MAX_CONFIGS = 64

_UNSET = object()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _typed_config_id(config_id: str) -> str:
    try:
        return validate_config_id(config_id)
    except FieldValidationError as exc:
        raise ProviderAuthorityError(
            422, "VALIDATION_ERROR", f"{exc.field}: {exc.reason}"
        )


def _revision_digest(record: Mapping[str, Any]) -> str:
    """sha256 over the canonical full revision record (digest excluded)."""
    payload = {k: v for k, v in record.items() if k != "digest"}
    canonical = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


class HarnessProviderConfigStore:
    """Authority for harness model provider configs + their revisions."""

    def __init__(self, home: Path) -> None:
        self._home = Path(home)
        self._path = self._home / STORE_FILENAME
        self._lock = threading.RLock()
        # One credential authority per home: probe orchestration and the
        # gateway secret materialization read values here — never the store.
        self.credentials = CredentialAuthority(self._home)
        self._accounts: Any = None

    # ------------------------------------------------------------------ #
    # durable file layer (atomic 0600)
    # ------------------------------------------------------------------ #
    def _load(self) -> list[dict[str, Any]]:
        try:
            raw = self._path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return []
        except OSError:
            raise ProviderAuthorityError(
                500, "CONFIG_STORE_CORRUPT", "config store could not be read"
            )
        try:
            parsed = json.loads(raw)
        except ValueError:
            raise ProviderAuthorityError(
                500, "CONFIG_STORE_CORRUPT", "config store could not be read"
            )
        if (
            not isinstance(parsed, dict)
            or parsed.get("schema_version") != SCHEMA_VERSION
            or not isinstance(parsed.get("configs"), list)
        ):
            raise ProviderAuthorityError(
                500, "CONFIG_STORE_CORRUPT", "config store could not be read"
            )
        return list(parsed["configs"])

    def _save(self, entries: Iterable[Mapping[str, Any]]) -> None:
        self._home.mkdir(mode=0o700, parents=True, exist_ok=True)
        payload = json.dumps(
            {"schema_version": SCHEMA_VERSION, "configs": list(entries)},
            ensure_ascii=False,
            indent=2,
        ).encode("utf-8")
        fd, tmp_name = tempfile.mkstemp(
            prefix=".configs.", suffix=".tmp", dir=self._home
        )
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_name, self._path)
        except BaseException:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise

    # ------------------------------------------------------------------ #
    # field validation (fail closed, content-free)
    # ------------------------------------------------------------------ #
    @staticmethod
    def _validate_record_fields(
        *,
        harness_type: Any,
        protocol_family: Any,
        base_url: Any,
        models: Any,
        credential_ref: Any,
        projection: Any,
        provider_account_ref: Any,
        enabled: Any,
    ) -> dict[str, Any]:
        try:
            if enabled is None:
                enabled = True
            if not isinstance(enabled, bool):
                raise FieldValidationError("enabled", "must be a boolean")
            return {
                "harness_type": validate_harness_type(harness_type),
                "protocol_family": validate_protocol_family(protocol_family),
                "base_url": validate_base_url(base_url),
                "models": validate_model_entries(models),
                "credential_ref": validate_credential_locator(credential_ref),
                "projection": validate_projection(projection),
                "provider_account_ref": validate_account_locator(provider_account_ref),
                "enabled": enabled,
            }
        except FieldValidationError as exc:
            raise ProviderAuthorityError(
                422, "VALIDATION_ERROR", f"{exc.field}: {exc.reason}"
            )

    def _require_account(self, locator: str) -> None:
        """A config origin must name a live account (locator-only check)."""
        if not locator:
            return
        from .accounts import ProviderAccountStore

        if self._accounts is None:
            self._accounts = ProviderAccountStore(self._home)
        account_id = locator.partition("/")[2]
        if not self._accounts.exists(account_id):
            raise ProviderAuthorityError(
                409, "CONFIG_ACCOUNT_NOT_FOUND", "provider account does not exist"
            )

    # ------------------------------------------------------------------ #
    # reads
    # ------------------------------------------------------------------ #
    @staticmethod
    def _entry_for(entries: list[dict[str, Any]], config_id: str) -> dict[str, Any]:
        for entry in entries:
            if entry.get("config_id") == config_id:
                return entry
        raise ProviderAuthorityError(404, "CONFIG_NOT_FOUND", "config not found")

    @staticmethod
    def _revision_for(entry: dict[str, Any], revision: Optional[int]) -> dict[str, Any]:
        if revision is None:
            revision = int(entry.get("current_revision", 1))
        for record in entry.get("revisions", []):
            if int(record.get("revision", 0)) == int(revision):
                return record
        raise ProviderAuthorityError(
            404, "CONFIG_REVISION_NOT_FOUND", "config revision not found"
        )

    def _record(
        self, config_id: str, revision: Optional[int] = None
    ) -> dict[str, Any]:
        with self._lock:
            entry = self._entry_for(self._load(), config_id)
            return dict(self._revision_for(entry, revision))

    def get(self, config_id: str, revision: Optional[int] = None) -> dict[str, Any]:
        """The exact revision (the stored current one when ``None``)."""
        _typed_config_id(config_id)
        return self._record(config_id, revision)

    def list(self) -> list[dict[str, Any]]:
        """Current revision records (public, locator-only rows)."""
        with self._lock:
            rows = []
            for entry in self._load():
                rows.append(dict(self._revision_for(entry, None)))
            return rows

    def current_revision(self, config_id: str) -> int:
        _typed_config_id(config_id)
        with self._lock:
            entry = self._entry_for(self._load(), config_id)
            return int(entry["current_revision"])

    # ------------------------------------------------------------------ #
    # refs + exact-revision resolution
    # ------------------------------------------------------------------ #
    def get_ref(
        self, config_id: str, revision: Optional[int] = None
    ) -> Ref:
        """The Execution-Binding Ref for one exact config revision."""
        record = self._record(config_id, revision)
        return Ref(
            RefType.ARTIFACT,
            PROVIDER_ID,
            f"{config_id}/revisions/{record['revision']}",
            metadata={
                "revision": str(record["revision"]),
                "digest": record["digest"],
                "harness_type": record["harness_type"],
            },
        )

    def resolve(self, ref: Any) -> HarnessModelProviderV1:
        """Re-materialize the contract value for the EXACT revision."""
        if getattr(ref, "type", None) is not RefType.ARTIFACT:
            raise ProviderAuthorityError(
                422, "CONFIG_REF_INVALID", "ref is not an artifact ref"
            )
        if getattr(ref, "provider", None) != PROVIDER_ID:
            raise ProviderAuthorityError(
                422, "CONFIG_REF_INVALID", "ref provider does not own this contract"
            )
        native_id = str(getattr(ref, "native_id", "") or "")
        config_id, separator, rest = native_id.partition("/revisions/")
        if not separator or not rest.isdigit():
            raise ProviderAuthorityError(
                422, "CONFIG_REF_INVALID", "ref native id is not a config revision"
            )
        revision = int(rest)
        record = self._record(config_id, revision)
        metadata = getattr(ref, "metadata", None) or {}
        expected_harness = metadata.get("harness_type")
        if expected_harness and expected_harness != record["harness_type"]:
            raise ProviderAuthorityError(
                422,
                "CONFIG_HARNESS_MISMATCH",
                "ref harness_type does not match the config revision",
            )
        expected_digest = metadata.get("digest")
        if expected_digest and expected_digest != record["digest"]:
            raise ProviderAuthorityError(
                409,
                "CONFIG_DIGEST_MISMATCH",
                "ref digest does not match the config revision",
            )
        return self._contract(record)

    @staticmethod
    def _contract(record: Mapping[str, Any]) -> HarnessModelProviderV1:
        return HarnessModelProviderV1(
            config_id=record["config_id"],
            harness_type=record["harness_type"],
            revision=int(record["revision"]),
            digest=record["digest"],
            protocol_family=record["protocol_family"],
            base_url=record["base_url"],
            models=tuple(dict(m) for m in record["models"]),
            credential_ref=record["credential_ref"],
            projection=dict(record["projection"]),
            provider_account_ref=record.get("provider_account_ref", ""),
            enabled=bool(record.get("enabled", True)),
        )

    def require_model(self, config_id: str, model_id: str) -> str:
        """Typed catalog check used before a model enters any binding."""
        record = self._record(config_id, None)
        if not isinstance(model_id, str) or not 0 < len(model_id) <= 128:
            raise ProviderAuthorityError(
                422, "VALIDATION_ERROR", "model: must be 1..128 chars"
            )
        if not any(m["model_id"] == model_id for m in record["models"]):
            raise ProviderAuthorityError(
                404, "MODEL_NOT_FOUND", "model is not in this config catalog"
            )
        return model_id

    # ------------------------------------------------------------------ #
    # writes (every accepted write = a new immutable revision)
    # ------------------------------------------------------------------ #
    def create(
        self,
        *,
        config_id: str,
        harness_type: str,
        protocol_family: str,
        base_url: str,
        models: Any = None,
        credential_ref: str = "",
        projection: Any = None,
        provider_account_ref: Optional[str] = None,
        enabled: bool = True,
    ) -> dict[str, Any]:
        _typed_config_id(config_id)
        with self._lock:
            entries = self._load()
            if any(e.get("config_id") == config_id for e in entries):
                raise ProviderAuthorityError(
                    409, "CONFIG_ALREADY_EXISTS", "a config with this id already exists"
                )
            if len(entries) >= MAX_CONFIGS:
                raise ProviderAuthorityError(
                    409, "CONFIG_LIMIT_EXCEEDED", "the bounded config store is full"
                )
            fields = self._validate_record_fields(
                harness_type=harness_type,
                protocol_family=protocol_family,
                base_url=base_url,
                models=models,
                credential_ref=credential_ref,
                projection=projection,
                provider_account_ref=provider_account_ref or "",
                enabled=enabled,
            )
            self._require_account(fields["provider_account_ref"])
            record = {
                "config_id": config_id,
                **fields,
                "revision": 1,
                "digest": "",
            }
            record["digest"] = _revision_digest(record)
            entry = {
                "config_id": config_id,
                "harness_type": fields["harness_type"],
                "current_revision": 1,
                "revisions": [record],
            }
            entries.append(entry)
            self._save(entries)
            return dict(record)

    def update(
        self,
        config_id: str,
        expected_revision: int,
        *,
        harness_type: Any = _UNSET,
        protocol_family: Any = None,
        base_url: Any = None,
        models: Any = None,
        credential_ref: Any = None,
        projection: Any = None,
        provider_account_ref: Any = _UNSET,
        enabled: Any = None,
    ) -> dict[str, Any]:
        """CAS update: revision N+1 or a typed 409 conflict."""
        _typed_config_id(config_id)
        with self._lock:
            entries = self._load()
            entry = self._entry_for(entries, config_id)
            current = dict(self._revision_for(entry, None))
            if int(current["revision"]) != int(expected_revision):
                raise ProviderAuthorityError(
                    409,
                    "CONFIG_REVISION_CONFLICT",
                    "config was modified concurrently; re-read and retry",
                )
            if harness_type is not _UNSET and harness_type != current["harness_type"]:
                raise ProviderAuthorityError(
                    409,
                    "CONFIG_HARNESS_IMMUTABLE",
                    "harness_type is frozen for the life of a config",
                )
            updated = dict(current)
            kwargs: dict[str, Any] = {}
            if protocol_family is not None:
                kwargs["protocol_family"] = protocol_family
            if base_url is not None:
                kwargs["base_url"] = base_url
            if models is not None:
                kwargs["models"] = models
            if credential_ref is not None:
                kwargs["credential_ref"] = credential_ref
            if projection is not None:
                kwargs["projection"] = projection
            if provider_account_ref is not _UNSET:
                kwargs["provider_account_ref"] = provider_account_ref or ""
            if enabled is not None:
                kwargs["enabled"] = enabled
            if kwargs:
                fields = self._validate_record_fields(
                    harness_type=current["harness_type"],
                    protocol_family=kwargs.get(
                        "protocol_family", current["protocol_family"]
                    ),
                    base_url=kwargs.get("base_url", current["base_url"]),
                    models=kwargs.get("models", current["models"]),
                    credential_ref=kwargs.get(
                        "credential_ref", current["credential_ref"]
                    ),
                    projection=kwargs.get("projection", current["projection"]),
                    provider_account_ref=kwargs.get(
                        "provider_account_ref", current.get("provider_account_ref", "")
                    ),
                    enabled=kwargs.get("enabled", current.get("enabled", True)),
                )
                # harness_type is frozen: it can only equal the current one.
                fields["harness_type"] = current["harness_type"]
                if fields["provider_account_ref"] != current.get(
                    "provider_account_ref", ""
                ):
                    self._require_account(fields["provider_account_ref"])
                updated.update(fields)
            updated["revision"] = int(current["revision"]) + 1
            updated["digest"] = ""
            updated["digest"] = _revision_digest(updated)
            entry["revisions"] = [
                *entry.get("revisions", []),
                updated,
            ]
            entry["current_revision"] = int(updated["revision"])
            self._save(entries)
            return dict(updated)

    # ------------------------------------------------------------------ #
    # guarded deletion (turn-Binding references via the public store API)
    # ------------------------------------------------------------------ #
    def find_references(
        self, config_id: str, *, session_store: Any
    ) -> list[dict[str, str]]:
        return find_config_references(session_store, config_id)

    def delete(
        self,
        config_id: str,
        *,
        session_store: Any = None,
        replacement_config_id: Optional[str] = None,
    ) -> None:
        _typed_config_id(config_id)
        with self._lock:
            entries = self._load()
            self._entry_for(entries, config_id)  # 404 when unknown
            if session_store is not None:
                references = find_config_references(session_store, config_id)
                if references:
                    if not replacement_config_id:
                        raise ProviderAuthorityError(
                            409,
                            "CONFIG_IN_USE",
                            "config is referenced by turn bindings; name a live replacement",
                        )
                    if replacement_config_id == config_id:
                        raise ProviderAuthorityError(
                            409,
                            "REPLACEMENT_CONFIG_INVALID",
                            "replacement must be a different live config",
                        )
                    if not any(
                        e.get("config_id") == replacement_config_id
                        for e in entries
                    ):
                        raise ProviderAuthorityError(
                            409,
                            "REPLACEMENT_CONFIG_NOT_FOUND",
                            "replacement config does not exist",
                        )
            # The credential value is owned by the user-view account layer
            # and may be shared by several configs: it is NOT destroyed here.
            remaining = [e for e in entries if e.get("config_id") != config_id]
            self._save(remaining)

    # ------------------------------------------------------------------ #
    # probe orchestration (value read at materialization only)
    # ------------------------------------------------------------------ #
    def probe(self, config_id: str, *, model: str) -> dict[str, Any]:
        """One bounded compatibility probe against this config's endpoint.

        The credential value is read from this store's credential authority
        at probe time and goes ONLY into the auth header.  Evidence carries
        no secret, no prompt, and no response body.
        """
        record = self._record(config_id, None)
        self.require_model(config_id, model)
        provider_id = provider_id_from_locator(record["credential_ref"])
        value = self.credentials.read(provider_id)
        if value is None:
            raise ProviderAuthorityError(
                409,
                "CONFIG_CREDENTIAL_REQUIRED",
                "probe requires a credential for this config",
            )
        return run_probe(
            record["protocol_family"],
            record["base_url"],
            model=model,
            credential_value=value,
        )
