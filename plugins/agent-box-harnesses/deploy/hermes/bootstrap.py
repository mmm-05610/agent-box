"""Deployment bootstrap for the managed Hermes runtime artifact (non-secret).

Why this file exists - measured, not assumed:

* Hermes keeps its authoritative native session store in SQLite at
  ``$HERMES_HOME/state.db`` (per ``hermes_state.DEFAULT_DB_PATH`` and
  ``acp_adapter.session.SessionManager._get_db``), with ``state.db-wal`` and
  ``state.db-shm`` beside it. The store is therefore a *file directly inside*
  the Hermes home, not a subdirectory of it.
* The AgentBox deployment contract can persist exactly one writable directory
  child of ``/tmp/agentbox-home`` (``stateProjection.target``), and it can
  project reviewed files only onto direct children of ``/tmp/agentbox-home``
  (``projectionFiles``). There is no deployment field that persists a file
  child, and Hermes 0.19 exposes no configuration key or environment variable
  that relocates ``state.db``.
* Consequently ``HERMES_HOME`` must *be* the persisted directory, and the
  reviewed `config.yaml` - which the deployment still projects read-only to
  ``/tmp/agentbox-home/config.yaml``, one level above the home - has to be
  materialized inside it before Hermes reads it.

This module copies that one reviewed file into the home when the bytes differ.
It patches nothing in Hermes: every Hermes read and write stays native, and the
copied content is byte-identical to the read-only projection the deployment
declared. Failures are loud, because a Hermes that silently starts without its
reviewed configuration would talk to the default endpoint instead of the
configured one.

The file is copied into the artifact as ``agentbox_hermes_bootstrap.py``;
``sitecustomize.py`` (also part of the artifact) is what CPython imports at
interpreter start, and the reviewed offline gate calls :func:`apply` directly.
"""
from __future__ import annotations

import os

#: Directory the deployment projects reviewed files into (fixed by the
#: deployment contract; see `docs/server-round1/fullstack/hermes-production-packaging.md`).
INBOX = "/tmp/agentbox-home"
#: The reviewed native configuration, projected read-only into the inbox.
SOURCE_NAME = "config.yaml"
#: Audit sink, set by the offline gate only; unset in production.
AUDIT_ENVIRONMENT = "AGENTBOX_BOOTSTRAP_AUDIT"


class HermesBootstrapError(RuntimeError):
    """A deployment this bootstrap refuses to start inside."""


def _record(line: str) -> None:
    location = os.environ.get(AUDIT_ENVIRONMENT)
    if not location:
        return
    try:
        with open(location, "a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except OSError:
        # Auditing must never be the reason the deployment fails to start.
        pass


def home() -> str:
    """The Hermes home this deployment declares, refused when it is unusable."""
    value = (os.environ.get("HERMES_HOME") or "").strip()
    if not value:
        raise HermesBootstrapError("AGENTBOX_HERMES_BOOTSTRAP_HOME_MISSING")
    if os.path.normpath(value) == os.path.normpath(INBOX):
        # A home that is the inbox itself cannot hold the persisted store: the
        # state projection is a child of the inbox, not the inbox.
        raise HermesBootstrapError("AGENTBOX_HERMES_BOOTSTRAP_HOME_NOT_PERSISTED")
    return value


def apply() -> dict[str, object]:
    """Materialize the reviewed configuration inside the persisted home."""
    target_home = home()
    source = os.path.join(INBOX, SOURCE_NAME)
    target = os.path.join(target_home, SOURCE_NAME)
    if not os.path.isfile(source):
        raise HermesBootstrapError("AGENTBOX_HERMES_BOOTSTRAP_CONFIG_MISSING")
    with open(source, "rb") as handle:
        content = handle.read()
    if not content:
        raise HermesBootstrapError("AGENTBOX_HERMES_BOOTSTRAP_CONFIG_EMPTY")
    os.makedirs(target_home, exist_ok=True)
    existing = None
    if os.path.isfile(target):
        try:
            with open(target, "rb") as handle:
                existing = handle.read()
        except OSError:
            existing = None
    if existing != content:
        # Write-then-rename: a partially written config.yaml must never be what
        # Hermes opens, and a home restored from a checkpoint is rewritten to
        # the reviewed bytes so a harness can never drift the effective
        # provider, model or endpoint between turns.
        temporary = target + ".agentbox-bootstrap"
        with open(temporary, "wb") as handle:
            handle.write(content)
        os.chmod(temporary, 0o600)
        os.replace(temporary, target)
        outcome = "written"
    else:
        outcome = "unchanged"
    _record(f"bootstrap-applied home={target_home} config={outcome} bytes={len(content)}")
    return {"home": target_home, "config": outcome, "bytes": len(content)}


if __name__ == "__main__":  # pragma: no cover - operator convenience
    print(apply())
