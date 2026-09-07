"""The user-view ProviderAccount store: ``AGENT_BOX_HOME/model-provider-accounts.json``.

Layer 1 of the user's two-layer model.  An account is the human-facing
bundle of endpoints and credential locators for one provider relationship:

- JSON file ``{"schema_version": 1, "accounts": [record, ...]}``, written
  atomically (0600 temp file + fsync + ``os.replace``) under a lock;
- at most 32 accounts; ids are immutable and never renamed;
- rows carry ``{account_id, display_name, endpoint_candidates,
  credential_refs, metadata}`` — locators only, never values;
- accounts NEVER enter Execution Bindings: this store exposes no Ref
  factory and no registry-resolvable contract.  Harness-facing execution
  authority lives in :mod:`.configs`; the only bridge is
  :meth:`ProviderAccountStore.propose_account_change`, which PROPOSES
  derived config revisions and never rewrites anything itself.
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional

from .errors import ProviderAuthorityError
from .validation import (
    FieldValidationError,
    account_locator_for,
    validate_account_id,
    validate_account_locator,
    validate_bounded_metadata,
    validate_credential_refs,
    validate_endpoint_candidates,
)

STORE_FILENAME = "model-provider-accounts.json"
SCHEMA_VERSION = 1
MAX_ACCOUNTS = 32


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _typed_account_id(account_id: str) -> str:
    try:
        return validate_account_id(account_id)
    except FieldValidationError as exc:
        raise ProviderAuthorityError(
            422, "VALIDATION_ERROR", f"{exc.field}: {exc.reason}"
        )


class ProviderAccountStore:
    """Authority for user-view provider accounts (locator-only rows)."""

    def __init__(self, home: Path) -> None:
        self._home = Path(home)
        self._path = self._home / STORE_FILENAME
        self._lock = threading.RLock()

    # ------------------------------------------------------------------ #
    # durable file layer (atomic 0600, like the migrated store style)
    # ------------------------------------------------------------------ #
    def _load(self) -> list[dict[str, Any]]:
        try:
            raw = self._path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return []
        except OSError:
            raise ProviderAuthorityError(
                500, "ACCOUNT_STORE_CORRUPT", "account store could not be read"
            )
        try:
            parsed = json.loads(raw)
        except ValueError:
            raise ProviderAuthorityError(
                500, "ACCOUNT_STORE_CORRUPT", "account store could not be read"
            )
        if (
            not isinstance(parsed, dict)
            or parsed.get("schema_version") != SCHEMA_VERSION
            or not isinstance(parsed.get("accounts"), list)
        ):
            raise ProviderAuthorityError(
                500, "ACCOUNT_STORE_CORRUPT", "account store could not be read"
            )
        return list(parsed["accounts"])

    def _save(self, records: Iterable[Mapping[str, Any]]) -> None:
        self._home.mkdir(mode=0o700, parents=True, exist_ok=True)
        payload = json.dumps(
            {"schema_version": SCHEMA_VERSION, "accounts": list(records)},
            ensure_ascii=False,
            indent=2,
        ).encode("utf-8")
        fd, tmp_name = tempfile.mkstemp(
            prefix=".accounts.", suffix=".tmp", dir=self._home
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
    # row shape (the ONLY shape that ever leaves this module)
    # ------------------------------------------------------------------ #
    @staticmethod
    def _row(record: Mapping[str, Any]) -> dict[str, Any]:
        return {
            "account_id": record["account_id"],
            "display_name": record["display_name"],
            "endpoint_candidates": list(record["endpoint_candidates"]),
            "credential_refs": list(record["credential_refs"]),
            "metadata": dict(record["metadata"]),
            "created_at": record["created_at"],
            "updated_at": record["updated_at"],
        }

    @staticmethod
    def _validate_fields(
        *,
        display_name: Any,
        endpoint_candidates: Any,
        credential_refs: Any,
        metadata: Any,
    ) -> dict[str, Any]:
        try:
            return {
                "display_name": ProviderAccountStore._bounded_label(display_name, "display_name"),
                "endpoint_candidates": validate_endpoint_candidates(endpoint_candidates),
                "credential_refs": validate_credential_refs(credential_refs),
                "metadata": validate_bounded_metadata(metadata),
            }
        except FieldValidationError as exc:
            raise ProviderAuthorityError(
                422, "VALIDATION_ERROR", f"{exc.field}: {exc.reason}"
            )

    @staticmethod
    def _bounded_label(value: str, field: str) -> str:
        if not isinstance(value, str) or not 0 < len(value.strip()) <= 128:
            raise FieldValidationError(field, "must be 1..128 chars")
        return value.strip()

    # ------------------------------------------------------------------ #
    # reads
    # ------------------------------------------------------------------ #
    def list_rows(self) -> list[dict[str, Any]]:
        with self._lock:
            return [self._row(record) for record in self._load()]

    def _get(self, account_id: str) -> dict[str, Any]:
        for record in self._load():
            if record.get("account_id") == account_id:
                return record
        raise ProviderAuthorityError(404, "ACCOUNT_NOT_FOUND", "account not found")

    def get(self, account_id: str) -> dict[str, Any]:
        _typed_account_id(account_id)
        with self._lock:
            return self._row(self._get(account_id))

    def exists(self, account_id: str) -> bool:
        _typed_account_id(account_id)
        with self._lock:
            try:
                self._get(account_id)
            except ProviderAuthorityError:
                return False
            return True

    # ------------------------------------------------------------------ #
    # writes
    # ------------------------------------------------------------------ #
    def create(
        self,
        *,
        account_id: str,
        display_name: str,
        endpoint_candidates: Any = None,
        credential_refs: Any = None,
        metadata: Any = None,
    ) -> dict[str, Any]:
        _typed_account_id(account_id)
        with self._lock:
            records = self._load()
            if any(r.get("account_id") == account_id for r in records):
                raise ProviderAuthorityError(
                    409, "ACCOUNT_ALREADY_EXISTS", "an account with this id already exists"
                )
            if len(records) >= MAX_ACCOUNTS:
                raise ProviderAuthorityError(
                    409, "ACCOUNT_LIMIT_EXCEEDED", "the bounded account store is full"
                )
            fields = self._validate_fields(
                display_name=display_name,
                endpoint_candidates=endpoint_candidates,
                credential_refs=credential_refs,
                metadata=metadata,
            )
            record = {
                "account_id": account_id,
                **fields,
                "created_at": _now(),
                "updated_at": _now(),
            }
            records.append(record)
            self._save(records)
            return self._row(record)

    _UNSET = object()

    def update(
        self,
        account_id: str,
        *,
        display_name: Any = _UNSET,
        endpoint_candidates: Any = _UNSET,
        credential_refs: Any = _UNSET,
        metadata: Any = _UNSET,
    ) -> dict[str, Any]:
        _typed_account_id(account_id)
        with self._lock:
            record = dict(self._get(account_id))
            kwargs: dict[str, Any] = {}
            if display_name is not self._UNSET:
                kwargs["display_name"] = display_name
            if endpoint_candidates is not self._UNSET:
                kwargs["endpoint_candidates"] = endpoint_candidates
            if credential_refs is not self._UNSET:
                kwargs["credential_refs"] = credential_refs
            if metadata is not self._UNSET:
                kwargs["metadata"] = metadata
            if kwargs:
                fields = self._validate_fields(
                    display_name=kwargs.get("display_name", record["display_name"]),
                    endpoint_candidates=kwargs.get(
                        "endpoint_candidates", record["endpoint_candidates"]
                    ),
                    credential_refs=kwargs.get(
                        "credential_refs", record["credential_refs"]
                    ),
                    metadata=kwargs.get("metadata", record["metadata"]),
                )
                record.update(fields)
            record["updated_at"] = _now()
            records = self._load()
            for index, current in enumerate(records):
                if current.get("account_id") == account_id:
                    records[index] = record
                    self._save(records)
                    return self._row(record)
            raise ProviderAuthorityError(404, "ACCOUNT_NOT_FOUND", "account not found")

    def delete(self, account_id: str) -> None:
        _typed_account_id(account_id)
        with self._lock:
            records = self._load()
            remaining = [
                record
                for record in records
                if record.get("account_id") != account_id
            ]
            if len(remaining) == len(records):
                raise ProviderAuthorityError(
                    404, "ACCOUNT_NOT_FOUND", "account not found"
                )
            self._save(remaining)

    # ------------------------------------------------------------------ #
    # account-derived proposal flow (NEVER auto-rewrites configs)
    # ------------------------------------------------------------------ #
    def propose_account_change(
        self, account_id: str, config_store: Any, **changed: Any
    ) -> dict[str, Any]:
        """List the derived configs that WOULD need new revisions.

        ``changed`` accepts the same keyword fields as :meth:`update`.
        The result is advisory only: neither the account nor any config is
        written.  Applying remains an explicit per-config ``update`` call
        on the harness config store.
        """
        _typed_account_id(account_id)
        with self._lock:
            account = self._get(account_id)
        known = {
            "display_name",
            "endpoint_candidates",
            "credential_refs",
            "metadata",
        }
        unknown = set(changed) - known
        if unknown:
            raise ProviderAuthorityError(
                422,
                "VALIDATION_ERROR",
                "unknown proposal fields: " + ", ".join(sorted(unknown)),
            )
        # Validate the proposed field values exactly as an update would.
        self._validate_fields(
            display_name=changed.get("display_name", account["display_name"]),
            endpoint_candidates=changed.get(
                "endpoint_candidates", account["endpoint_candidates"]
            ),
            credential_refs=changed.get("credential_refs", account["credential_refs"]),
            metadata=changed.get("metadata", account["metadata"]),
        )

        next_candidates = changed.get(
            "endpoint_candidates", account["endpoint_candidates"]
        )
        next_refs = changed.get("credential_refs", account["credential_refs"])
        locator = account_locator_for(account_id)

        proposals: list[dict[str, Any]] = []
        for config in config_store.list():
            if config.get("provider_account_ref") != locator:
                continue
            delta: dict[str, Any] = {}
            if (
                changed.get("endpoint_candidates") is not None
                and next_candidates
                and config["base_url"] != next_candidates[0]
            ):
                delta["base_url"] = next_candidates[0]
            if (
                changed.get("credential_refs") is not None
                and next_refs
                and config["credential_ref"] not in next_refs
            ):
                delta["credential_ref"] = next_refs[0]
            if delta:
                proposals.append(
                    {
                        "config_id": config["config_id"],
                        "current_revision": int(config["revision"]),
                        "proposed_changes": delta,
                    }
                )
        return {"account_id": account_id, "proposals": proposals}
