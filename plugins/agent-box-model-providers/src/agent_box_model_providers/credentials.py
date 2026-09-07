"""The write-only credential authority + execution-scoped secret staging.

Layout (frozen by the P2 contract §3):

- ``AGENT_BOX_HOME/credentials/<locator>.json`` with locator form
  ``gateway/<provider_id>``, i.e. ``credentials/gateway/<provider_id>.json``;
- file mode ``0600``, body ``{"value": ..., "updated_at": ...}``;
- the value is read ONLY at materialization boundaries (execution-scoped
  staging, harness projection, probe execution).  It never appears in API
  responses, events, logs, manifests, or any file outside the credentials
  and staging directories;
- replace = overwrite (same 0600 discipline), delete removes the file.

Writes are atomic: a temp file created with ``os.open(O_CREAT|O_TRUNC)``
and ``fchmod(0o600)``, fsynced, then ``os.replace``-renamed into place.
No log line ever carries the value; exceptions carry no content.

Execution-scoped materialization (:meth:`CredentialAuthority.prepare_env_secret`)
copies the value ONCE into ``AGENT_BOX_HOME/credentials-staging/<scope>/``
(mode 0600) and returns a :class:`PreparedSecretMount` carrying a random
capability token.  The staging file is what the sandbox binds read-only at
``/runtime/credential/secret``; ``cleanup(execution_scope)`` removes the
whole scope directory.  The value never returns to any caller.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from agent_box.protocols.credentials.protocol import PreparedSecretMount
from agent_box.resource_contracts import CredentialRefV1

from .errors import ProviderAuthorityError
from .validation import LOCATOR_NAMESPACE, locator_for, validate_provider_id

_CREDENTIALS_DIRNAME = "credentials"
STAGING_DIRNAME = "credentials-staging"
GUEST_TARGET = "/runtime/home/.credential/secret"

# Execution scopes name one ephemeral execution: bounded charset, no path
# separators, no traversal.
_SCOPE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def validate_execution_scope(execution_scope: str) -> str:
    if not isinstance(execution_scope, str) or not _SCOPE_RE.fullmatch(execution_scope):
        raise ProviderAuthorityError(
            422, "VALIDATION_ERROR", "execution_scope: invalid scope name"
        )
    if ".." in execution_scope:
        raise ProviderAuthorityError(
            422, "VALIDATION_ERROR", "execution_scope: invalid scope name"
        )
    return execution_scope


def provider_id_from_locator(credential_ref: object) -> str:
    """The ``<provider_id>`` behind a ``gateway/<id>`` locator (duck-typed).

    Accepts a plain locator string, a work-core Ref / CredentialRefV1-like
    object, or a mapping — the same duck-typing the gateway source has
    always used for dispatch refs.
    """
    if isinstance(credential_ref, str):
        locator = credential_ref
    else:
        locator = str(
            getattr(credential_ref, "native_locator", None)
            or getattr(credential_ref, "native_id", None)
            or (
                credential_ref.get("native_locator")
                if isinstance(credential_ref, dict)
                else ""
            )
            or ""
        )
    if locator.startswith("gateway-provider/"):
        # a dispatch ref names the RESOLVER as provider and carries the
        # gateway locator as its native id second segment
        locator = locator.split("/", 1)[1]
    namespace, _, provider_id = locator.partition("/")
    if namespace != LOCATOR_NAMESPACE or not provider_id:
        raise ProviderAuthorityError(
            422, "GATEWAY_CREDENTIAL_LOCATOR_INVALID", "credential locator is invalid"
        )
    if "/" in provider_id or ".." in provider_id:
        raise ProviderAuthorityError(
            422, "GATEWAY_CREDENTIAL_LOCATOR_INVALID", "credential locator is invalid"
        )
    try:
        validate_provider_id(provider_id)
    except ValueError as exc:
        raise ProviderAuthorityError(
            422, "GATEWAY_CREDENTIAL_LOCATOR_INVALID", "credential locator is invalid"
        ) from exc
    return provider_id


class CredentialAuthority:
    """Filesystem authority for provider credential values + staging."""

    def __init__(self, home: Path) -> None:
        self._home = Path(home)
        self._root = self._home / _CREDENTIALS_DIRNAME
        self._namespace_dir = self._root / LOCATOR_NAMESPACE
        self._staging_root = self._home / STAGING_DIRNAME
        self._root.mkdir(mode=0o700, parents=True, exist_ok=True)

    # -- paths ------------------------------------------------------------

    def path_for(self, provider_id: str) -> Path:
        """The on-disk credential file for one provider.

        Fails closed on any id outside the strict regex, so the locator
        can never be turned into a path traversal.
        """
        validate_provider_id(provider_id)
        return self._namespace_dir / f"{provider_id}.json"

    def locator(self, provider_id: str) -> str:
        return locator_for(provider_id)

    @property
    def staging_root(self) -> Path:
        return self._staging_root

    def staging_dir_for(self, execution_scope: str) -> Path:
        validate_execution_scope(execution_scope)
        return self._staging_root / execution_scope

    # -- write-only surface -------------------------------------------------

    def set(self, provider_id: str, value: str) -> None:
        """Replace (or create) the credential.  The value is never logged."""
        target = self.path_for(provider_id)
        self._namespace_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        payload = json.dumps(
            {"value": value, "updated_at": _now()},
            ensure_ascii=False,
        ).encode("utf-8")
        fd, tmp_name = tempfile.mkstemp(
            prefix=f".{provider_id}.", suffix=".tmp", dir=self._namespace_dir
        )
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_name, target)
        except BaseException:
            # Best-effort temp cleanup; never raises over the original error.
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise
        try:
            os.chmod(target, 0o600)
        except OSError:
            pass

    def delete(self, provider_id: str) -> bool:
        """Remove the credential file; deleting a missing file is a no-op."""
        target = self.path_for(provider_id)
        try:
            target.unlink()
            return True
        except FileNotFoundError:
            return False

    # -- materialization-boundary reads --------------------------------------

    def present(self, provider_id: str) -> bool:
        return self.path_for(provider_id).is_file()

    def read(self, provider_id: str) -> str | None:
        """Read the credential value (materialization boundaries only).

        A corrupt credential file fails closed with a content-free typed
        error — the file's content is never echoed.
        """
        target = self.path_for(provider_id)
        try:
            raw = target.read_text(encoding="utf-8")
        except FileNotFoundError:
            return None
        except OSError:
            raise ProviderAuthorityError(
                500, "CREDENTIAL_UNREADABLE", "credential file could not be read"
            )
        try:
            value = json.loads(raw).get("value")
        except ValueError:
            raise ProviderAuthorityError(
                500, "CREDENTIAL_UNREADABLE", "credential file could not be read"
            )
        if not isinstance(value, str) or not value:
            raise ProviderAuthorityError(
                500, "CREDENTIAL_UNREADABLE", "credential file could not be read"
            )
        return value

    # -- execution-scoped staging (secret materialization) --------------------

    def prepare_env_secret(
        self,
        credential_ref: object,
        execution_scope: str,
        *,
        content_override: bytes | None = None,
    ) -> tuple[Path, PreparedSecretMount]:
        """Copy the value ONCE into an execution-scoped staging file.

        Returns ``(host_staging_path, prepared_mount)``.  The staging file
        is mode 0600 under ``credentials-staging/<execution_scope>/`` and
        the mount carries only a random capability token — never the
        value, never the source path.  ``content_override`` replaces the
        stored value with rendered content (the ModelProvider's provider
        fragment for fragment-mount delivery); it is staged with the same
        0600 discipline and never persisted anywhere else.
        """
        scope = validate_execution_scope(execution_scope)
        provider_id = provider_id_from_locator(credential_ref)
        value = self.read(provider_id)
        if value is None:
            raise ProviderAuthorityError(
                409,
                "GATEWAY_CREDENTIAL_REQUIRED",
                "credential has no stored value for this locator",
            )
        if content_override is not None:
            value = content_override.decode("utf-8")
        staging_dir = self._staging_root / scope
        staging_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        target = staging_dir / f"{provider_id}.secret"
        fd, tmp_name = tempfile.mkstemp(
            prefix=f".{provider_id}.", suffix=".tmp", dir=staging_dir
        )
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "wb") as handle:
                handle.write(value.encode("utf-8"))
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_name, target)
        except BaseException:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise
        try:
            os.chmod(target, 0o600)
        except OSError:
            pass
        value_ref = CredentialRefV1(
            provider="gateway-provider",
            native_locator=locator_for(provider_id),
            harness_scope="gateway",
        )
        prepared = PreparedSecretMount(
            token="gateway-secret:" + secrets.token_urlsafe(24),
            credential_ref=value_ref,
            execution_scope=scope,
            guest_target=GUEST_TARGET,
            access="ro",
        )
        return target, prepared

    def cleanup(self, execution_scope: str) -> None:
        """Remove one execution scope's staging directory."""
        staging_dir = self.staging_dir_for(execution_scope)
        # Defense in depth: never remove anything outside the staging root.
        if staging_dir.parent != self._staging_root:
            raise ProviderAuthorityError(
                422, "VALIDATION_ERROR", "execution_scope: invalid scope name"
            )
        shutil.rmtree(staging_dir, ignore_errors=True)
