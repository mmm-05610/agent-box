"""Resource Library providers for the model-provider authority.

Two ResourceProviders are registered by this plugin:

- ``harness-model-providers`` — the registry resolver for the Root
  ``agent-box.harness-model-provider@1`` contract.  Its descriptor id is
  exactly the Ref provider, so the registry routes
  ``<config_id>/revisions/<n>`` artifact refs here for exact-revision
  resolution.  It also carries the plain management surface the studio's
  thin REST layer calls THROUGH the registry (create/update/get/delete/
  probe/credential management).
- ``gateway-provider`` — the locator-only gateway credential source
  (moved here from the harnesses plugin and reworked): ``resolve`` yields
  a ``CredentialRefV1``; the value materializes ONCE into an
  execution-scoped staging file via the credential authority's
  ``prepare_env_secret`` and is bound read-only into the sandbox at
  ``/runtime/credential/secret``.  The value never returns to any caller.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Mapping

from agent_box.protocols.host import ResourceLibraryDescriptor
from agent_box.resource_contracts import CredentialRefV1, HarnessModelProviderV1
from agent_box.work_core import Ref, RefType
from agent_box.work_core.registry import ProviderDescriptor

from .configs import PROVIDER_ID
from .credentials import CredentialAuthority
from .errors import ProviderAuthorityError

CONTRACT_ID = HarnessModelProviderV1.contract_id
CREDENTIAL_CONTRACT_ID = CredentialRefV1.contract_id
LOCATOR_NAMESPACE = "gateway"
GUEST_TARGET = "/runtime/home/.credential/secret"


class HarnessModelProviderConfigResolver:
    """Registry resolver + management facade for harness provider configs."""

    provider = PROVIDER_ID
    provider_id = PROVIDER_ID
    supported_contract_ids = frozenset({CONTRACT_ID})

    def __init__(self, store: Any, accounts: Any = None) -> None:
        self.store = store
        self.accounts = accounts

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(
            self.provider_id, "Harness model provider configs", "1"
        )

    # -- registry resolution (exact revisions only) ----------------------
    def resolve(
        self, contract_id: str, ref: Ref, *, context: Any = None
    ) -> HarnessModelProviderV1:
        del context
        if contract_id != CONTRACT_ID:
            raise ValueError("HARNESS_MODEL_PROVIDER_REF_MISMATCH")
        if getattr(ref, "provider", None) != self.provider_id or getattr(
            ref, "type", None
        ) is not RefType.ARTIFACT:
            raise ValueError("HARNESS_MODEL_PROVIDER_REF_MISMATCH")
        return self.store.resolve(ref)

    # -- plain accessors for the thin REST layer (through the registry) ----
    def get(self, config_id: str, revision: int | None = None) -> dict[str, Any]:
        return self.store.get(config_id, revision)

    def get_ref(self, config_id: str, revision: int | None = None) -> Ref:
        return self.store.get_ref(config_id, revision)

    def list(self) -> list[dict[str, Any]]:
        return self.store.list()

    def current_revision(self, config_id: str) -> int:
        return self.store.current_revision(config_id)

    def probe(self, config_id: str, *, model: str) -> dict[str, Any]:
        return self.store.probe(config_id, model=model)

    def create(self, **kwargs: Any) -> dict[str, Any]:
        return self.store.create(**kwargs)

    def update(self, config_id: str, expected_revision: int, **kwargs: Any) -> dict[str, Any]:
        return self.store.update(config_id, expected_revision, **kwargs)

    def delete(self, config_id: str, **kwargs: Any) -> None:
        return self.store.delete(config_id, **kwargs)

    def propose(self, account_id: str, **changed: Any) -> dict[str, Any]:
        if self.accounts is None:
            raise ProviderAuthorityError(
                500, "ACCOUNT_STORE_UNAVAILABLE", "account store is not attached"
            )
        return self.accounts.propose_account_change(account_id, self.store, **changed)

    @property
    def credentials(self) -> CredentialAuthority:
        return self.store.credentials


def render_provider_fragment(
    harness_type: str, record: Mapping[str, Any], credential_value: str
) -> bytes:
    """Render the HarnessProviderConfig's credential-bearing native fragment.

    The fragment is the SECOND MOUNT (二次挂载): a read-only file projected
    over the writable native home for exactly one execution.  It carries the
    endpoint/model/credential the harness needs; the host-side profile home
    never receives it (the bind ends with the sandbox; the reconcile's
    config-managed class never flows back).
    """
    if harness_type == "hermes":
        models = record.get("models") or []
        model_id = str((models[0] or {}).get("model_id", "")) if models else ""
        model_block = {
            "default": model_id,
            "provider": "minimax",
            "base_url": str(record.get("base_url", "")),
            "api_key": credential_value,
        }
        try:
            import yaml as _yaml

            return _yaml.safe_dump(
                {"Model": model_block}, allow_unicode=True, sort_keys=False
            ).encode("utf-8")
        except ImportError:
            # JSON is valid YAML; hermes parses either
            import json as _json

            return _json.dumps({"Model": model_block}, indent=2).encode("utf-8")
    raise ValueError(f"NO_PROVIDER_FRAGMENT_RENDERER:{harness_type}")


class GatewayCredentialSource:
    """Registry resolver + execution-scoped materializer for gateway creds.

    The locator form is ``gateway/<provider_id>``.  The dispatched VALUE is
    the locator itself; the secret material stays behind the credential
    authority and is staged once per execution scope as a 0600 file the
    sandbox binds read-only at ``/runtime/credential/secret``.
    """

    provider = "gateway-provider"
    provider_id = "gateway-provider"
    supported_contract_ids = frozenset({CREDENTIAL_CONTRACT_ID})

    def __init__(
        self,
        authority: CredentialAuthority | None = None,
        *,
        agent_box_home: Path | None = None,
        config_store: Any = None,
    ) -> None:
        self._config_store = config_store
        if authority is not None:
            self._authority = authority
        else:
            home = agent_box_home or os.environ.get("AGENT_BOX_HOME")
            if home is None:
                raise ValueError("GATEWAY_CREDENTIAL_AUTHORITY_UNAVAILABLE")
            self._authority = CredentialAuthority(Path(home))

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Gateway provider credential", "1")

    # -- duck-typed ref validation ----------------------------------------
    def validate(self, value: Any) -> None:
        if value is None:
            return
        # duck-typed: work-core Ref / CredentialRefV1 / dict / test doubles
        provider = getattr(value, "provider", None) or (
            value.get("provider") if isinstance(value, dict) else None
        )
        locator = (
            getattr(value, "native_locator", None)
            or getattr(value, "native_id", None)
            or (value.get("native_locator") if isinstance(value, dict) else None)
        )
        if provider != self.provider or not str(locator or "").startswith(
            f"{LOCATOR_NAMESPACE}/"
        ):
            raise ValueError("UNSUPPORTED_GATEWAY_CREDENTIAL_SOURCE")

    def resolve(self, contract_id: Any, ref: Any, *, context: Any = None) -> CredentialRefV1:
        """Resolve to the contract's locator-only value: a CredentialRefV1.

        The gateway credential's dispatched VALUE is the locator itself;
        the secret material stays behind ``prepare_mount`` until the
        execution-scoped staging bind.
        """
        del context
        if contract_id != CREDENTIAL_CONTRACT_ID:
            raise ValueError("CREDENTIAL_REF_MISMATCH")
        self.validate(ref)
        native_locator = str(
            getattr(ref, "native_locator", None)
            or getattr(ref, "native_id", None)
            or ""
        )
        return CredentialRefV1(
            provider=self.provider,
            native_locator=native_locator,
            harness_scope="gateway",
        )

    # -- execution-scoped secret materialization ---------------------------
    def prepare_mount(
        self, ref: Any, execution_scope: str, guest_target: str, access: str
    ) -> Any:
        """Materialize the credential for one execution scope.

        Two delivery forms, both as a 0600 staging file the sandbox binds
        read-only (the secret never enters a plan, env, argv or digest):

        - fragment mount (二次挂载): the guest target is a native-home
          config path; the staged file is the ModelProvider's rendered
          provider fragment (endpoint/model/credential), layered OVER the
          writable native home for exactly this execution.
        - bare secret file: the guest target is the launcher's secret
          source; a fixed in-guest launcher reads it and sets the env var.
        """
        if not isinstance(ref, CredentialRefV1):
            raise TypeError("credential mount requires CredentialRefV1")
        self.validate(ref)
        if (
            not str(execution_scope).startswith("execution:")
            or access != "ro"
            or not str(guest_target).startswith("/runtime/home/")
        ):
            raise ValueError("GATEWAY_SECRET_MOUNT_REJECTED")
        value_ref = self.resolve(CREDENTIAL_CONTRACT_ID, ref)
        config_id = str(value_ref.native_locator).split("/", 1)[1]
        record = None
        if self._config_store is not None:
            try:
                record = self._config_store.get(config_id)
            except Exception:  # noqa: BLE001 - fall back to the bare secret
                record = None
        if record is not None:
            from agent_box_model_providers.credentials import (
                CredentialAuthority as _CA,
            )

            credential_value = self._authority.read(config_id) if isinstance(
                self._authority, _CA
            ) else None
            if credential_value is None:
                raise ValueError("GATEWAY_CREDENTIAL_UNREADABLE")
            content = render_provider_fragment(
                str(record.get("harness_type", "")), record, credential_value
            )
            _staging_path, prepared = self._authority.prepare_env_secret(
                value_ref.native_locator, execution_scope,
                content_override=content,
            )
            return prepared
        _staging_path, prepared = self._authority.prepare_env_secret(
            value_ref.native_locator, execution_scope
        )
        return prepared

    def bind_to_sandbox(self, prepared: Any, sandbox_port: Any) -> None:
        register = getattr(
            getattr(sandbox_port, "provider", None),
            "register_prepared_secret_mount",
            None,
        )
        if not callable(register):
            raise ValueError("sandbox does not support typed secret mounts")
        source = self._staging_path_for(prepared)
        register(prepared, source)

    def cleanup_mount(self, prepared: Any, sandbox_port: Any = None) -> None:
        if sandbox_port is not None:
            sources = getattr(
                getattr(sandbox_port, "provider", None), "_secret_sources", None
            )
            if isinstance(sources, dict):
                sources.pop(prepared.token, None)

    def cleanup(self, prepared: Any) -> None:
        """Remove the execution scope's staged secret material."""
        self._authority.cleanup(prepared.execution_scope)

    def _staging_path_for(self, prepared: Any) -> Path:
        staging_dir = self._authority.staging_dir_for(prepared.execution_scope)
        provider_id = prepared.credential_ref.native_locator.partition("/")[2]
        return staging_dir / f"{provider_id}.secret"


class HarnessModelProviderLibrary:
    """Management view over the config resolver (the Resource Library)."""

    def __init__(self, resolver: HarnessModelProviderConfigResolver) -> None:
        self._resolver = resolver

    def descriptor(self) -> ResourceLibraryDescriptor:
        return ResourceLibraryDescriptor(
            PROVIDER_ID,
            CONTRACT_ID,
            "Harness Model Providers",
            frozenset({"list", "get", "create_revision", "disable", "delete", "probe"}),
        )

    def list_resources(self) -> tuple[dict[str, Any], ...]:
        return tuple(self._resolver.list())

    def get_resource(self, ref: Any) -> dict[str, Any]:
        native_id = str(getattr(ref, "native_id", "") or "")
        config_id, separator, rest = native_id.partition("/revisions/")
        if not separator or not rest.isdigit():
            raise ProviderAuthorityError(
                422, "CONFIG_REF_INVALID", "ref native id is not a config revision"
            )
        return self._resolver.get(config_id, int(rest))

    def create_revision(self, data: Any, expected_revision: int | None = None) -> dict[str, Any]:
        """Create the config (revision 1) or CAS-update it to revision N+1."""
        if not isinstance(data, dict) or not data.get("config_id"):
            raise ProviderAuthorityError(
                422, "VALIDATION_ERROR", "config_id: is required"
            )
        config_id = str(data["config_id"])
        fields = {
            key: data[key]
            for key in (
                "harness_type",
                "protocol_family",
                "base_url",
                "models",
                "credential_ref",
                "projection",
                "provider_account_ref",
                "enabled",
            )
            if key in data
        }
        try:
            current = self._resolver.get(config_id)
        except ProviderAuthorityError:
            return self._resolver.create(config_id=config_id, **fields)
        revision = (
            int(expected_revision)
            if expected_revision is not None
            else int(current["revision"])
        )
        fields.pop("harness_type", None)  # immutable after creation
        return self._resolver.update(config_id, revision, **fields)

    def disable(self, config_id: str, revision: int) -> dict[str, Any]:
        return self._resolver.update(config_id, int(revision), enabled=False)

    def delete(self, config_id: str, **kwargs: Any) -> None:
        return self._resolver.delete(config_id, **kwargs)


# -- plain accessor functions for the studio's thin REST layer -----------------


def model_provider_config_store(registry: Any) -> Any:
    """The registered management resolver (through the registry)."""
    return registry.get_resource_provider(PROVIDER_ID)


def provider_account_store(registry: Any) -> Any:
    """The registered ProviderAccountStore (through the registry)."""
    accounts = registry.get_resource_provider(PROVIDER_ID).accounts
    if accounts is None:
        raise ProviderAuthorityError(
            500, "ACCOUNT_STORE_UNAVAILABLE", "account store is not attached"
        )
    return accounts


def gateway_credential_source(registry: Any) -> GatewayCredentialSource:
    """The registered gateway credential source (through the registry)."""
    return registry.get_resource_provider("gateway-provider")
