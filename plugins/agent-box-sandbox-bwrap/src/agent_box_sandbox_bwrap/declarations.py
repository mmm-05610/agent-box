"""Provider-neutral capability declarations for the bwrap sandbox (CAP-01).

The declaration document is built *per execution*: the assembly boundary calls
:func:`sandbox_declaration_document` with exactly the deployment-derived
targets the launcher is about to enforce, the authoritative environment
binding of that execution, and the observation time.  Nothing here derives
targets from the enforcement posture in reverse, and nothing is narrowed
silently — a target this plugin cannot express in its own path grammar is a
typed refusal (:class:`ProjectionRejected`), not a smaller claim.

What the fixed remote template actually enforces (provider.py):

* every readonly face is bound ``--ro-bind`` (runtime view, executables,
  projections, verified artifacts, secrets), so ``filesystem.readonly@1`` is
  declared *supported* over exactly the targets passed in;
* ``/workspace`` and the declared state target are bound writable, so
  ``filesystem.writable@1`` is declared *supported* over exactly the targets
  passed in;
* the remote argv never emits ``--unshare-net``, so ``network.inherit@1`` is
  the honest posture and ``network.none@1`` is declared *unavailable* — the
  template does not offer that isolation.

Every declaration carries one :class:`EvidenceRef` anchored to the compiler
symbol or argv literal above, bound to this execution's environment binding,
observed at this execution's time, and never expiring (a static fact about a
fixed template).  The document digest is ``sha256(canonical json)`` over the
exact declarations plus the binding — same distribution, same execution
identity, same digest.
"""
from __future__ import annotations

import hashlib
import re
from pathlib import PurePosixPath

from agent_box.extensions import capability
from agent_box.extensions.capability import (
    EvidenceRef,
    RequirementParameterSet,
    SandboxDeclaration,
    SandboxDeclarationDocument,
    canonical_json,
    require_capability_id,
)

from .artifacts import RuntimeArtifactRejected, validate_runtime_artifact_target
from .home_projection import (
    PROJECTION_DIRECTORY,
    PROJECTION_FILE,
    HomeProjectionRejected,
    home_projection_target,
    protected_state_paths,
)
from .provider import ProjectionRejected

#: The fixed template's executable namespace (provider.py argv builder): only
#: ``/runtime/bin/<name>`` targets are ever mounted as executables.
_EXECUTABLE_TARGET = re.compile(r"/runtime/bin/[A-Za-z0-9._-]+")

#: The declaration-side provider identity (distinct from PROVIDER_ID, which
#: names the sandbox resource provider; this one names the declarer).
DECLARATION_PROVIDER = "sandbox-bwrap"
#: The declaration document revision; a bump is an incompatible boundary.
DECLARATION_REVISION = 1

_READONLY_CAPABILITY = require_capability_id("filesystem.readonly@1")
_WRITABLE_CAPABILITY = require_capability_id("filesystem.writable@1")
_NETWORK_INHERIT_CAPABILITY = require_capability_id("network.inherit@1")
_NETWORK_NONE_CAPABILITY = require_capability_id("network.none@1")

#: Evidence anchors into the fixed remote sidecar compiler: the compiler
#: symbol owns every readonly/writable bind decision, and the argv literal at
#: provider.py:259-263 is the base template that never emits ``--unshare-net``
#: — the absence of that flag is the fact behind ``network.none@1``.
_COMPILE_LOCATOR = "provider.py:compile_remote_sidecar_bwrap_argv"
# Row anchors adapted to this tree (source branch had 259-263): the sidecar
# compiler assembles its argv at provider.py:297-300 and that argv block
# carries no --unshare-net, which is exactly the evidence both anchors cite.
_NETWORK_ARGV_LOCATOR = "provider.py:297-300"
_NETWORK_ABSENCE_LOCATOR = "provider.py:297-300(absence)"


def _base_canonical(value: object) -> str:
    """Reject non-canonical paths before any namespace grammar is consulted.

    A ``str`` starting with ``/`` that is exactly its ``PurePosixPath``
    spelling — no empty segment (``//``), no ``.``/``..`` segment, no NUL, no
    control character.  Violations refuse the whole document; there is no
    normalization.
    """
    if (not isinstance(value, str)
            or not value.startswith("/")
            or "\x00" in value
            or any(ord(c) < 0x20 or ord(c) == 0x7F for c in value)
            or "//" in value
            or any(part in {".", ".."} for part in value.split("/"))
            or str(PurePosixPath(value)) != value):
        raise ProjectionRejected("declaration target is not a canonical absolute path")
    return value


def _readonly_target(value: object) -> str:
    """A readonly target must fall inside a namespace the template really enforces.

    The fixed remote compiler mounts three deployment-driven readonly faces:
    executables under ``/runtime/bin/<name>``, home projections (files under
    the guest home grammar), and verified runtime artifacts under
    ``/runtime/artifacts/<name>``.  The acceptable-with-declaration set is the
    union of exactly those three grammars and nothing wider — a target outside
    every one of them (``/etc/passwd``) is refused here instead of being
    declared supportable.
    """
    _base_canonical(value)
    assert isinstance(value, str)
    if _EXECUTABLE_TARGET.fullmatch(value):
        return value
    try:
        return home_projection_target(value, kind=PROJECTION_FILE)
    except HomeProjectionRejected:
        pass
    try:
        return validate_runtime_artifact_target(value)
    except (RuntimeArtifactRejected, ProjectionRejected):
        pass
    raise ProjectionRejected(
        "readonly declaration target is outside the template's enforceable namespaces"
    )


def _writable_target(value: object) -> str:
    """A writable target must be expressible as a home-projection directory.

    The only deployment-driven writable face is the declared state directory,
    held to the same home grammar the compiler will apply; ``/etc`` or any
    other canonical path is refused rather than declared writable.
    """
    _base_canonical(value)
    assert isinstance(value, str)
    return home_projection_target(value, kind=PROJECTION_DIRECTORY)


def _evidence(locator: str, environment_binding: str, observed_at: int) -> tuple[EvidenceRef, ...]:
    """One file-symbol evidence ref bound to this execution; a static fact never expires."""
    return (EvidenceRef(
        kind="file-symbol", locator=locator,
        environment_binding=environment_binding,
        observed_at=observed_at, expires_at=None,
    ),)


def _declaration(
    capability_id: str, support_state: capability.SupportState,
    parameters: RequirementParameterSet | None, evidence: tuple[EvidenceRef, ...],
) -> SandboxDeclaration:
    return SandboxDeclaration(
        capability_id=capability_id, support_state=support_state,
        condition=None, parameters=parameters, evidence=evidence,
        provider=DECLARATION_PROVIDER,
    )


def _document_digest(doc_fields: dict) -> str:
    """``sha256(canonical json)`` over the document fields, pure hex (no prefix).

    The digest covers the declarations and the environment binding — the
    exact payload that makes this document a receipt of one execution — and
    deliberately not itself.
    """
    return hashlib.sha256(canonical_json(doc_fields).encode("utf-8")).hexdigest()


def sandbox_declaration_document(
    *, readonly_targets: tuple[str, ...], writable_targets: tuple[str, ...],
    environment_binding: str, observed_at: int,
) -> capability.SandboxDeclarationDocument:
    """Build this execution's neutral declaration document.

    ``readonly_targets`` / ``writable_targets`` are the deployment-derived
    faces the launcher will enforce (the caller's inputs, validated here with
    the plugin's own grammar, stored sorted); ``environment_binding`` is the
    authoritative environment identity of the execution being declared for;
    ``observed_at`` is the epoch second the template posture was read.
    """
    readonly = tuple(sorted(_readonly_target(t) for t in readonly_targets))
    writable = tuple(sorted(_writable_target(t) for t in writable_targets))
    # Cross-target relations the compiler re-checks on the exact argv it will
    # emit (provider.py:241-288 in this tree): every mount target unique, home
    # projection files free of ancestor overlap, and no writable state target
    # sitting on or inside a projected file.  Reusing the plugin's own
    # derivation keeps the declarable set <= the actually enforceable set.
    if len(set((*readonly, *writable))) != len(readonly) + len(writable):
        raise ProjectionRejected("declaration targets collide or repeat")
    home_files = tuple(
        t for t in readonly if t.startswith("/runtime/home/")
    )
    if writable:
        for state in writable:
            protected_state_paths(home_files, state)
    else:
        # No writable face declared: still verify the projection-file relations
        # (duplicates and ancestor overlap) the compiler would re-check.
        protected_state_paths(home_files, None)
    declarations = (
        _declaration(
            _READONLY_CAPABILITY, "supported",
            RequirementParameterSet(targets=readonly),
            _evidence(_COMPILE_LOCATOR, environment_binding, observed_at),
        ),
        _declaration(
            _WRITABLE_CAPABILITY, "supported",
            RequirementParameterSet(targets=writable),
            _evidence(_COMPILE_LOCATOR, environment_binding, observed_at),
        ),
        _declaration(
            _NETWORK_INHERIT_CAPABILITY, "supported",
            RequirementParameterSet(),  # 无参数面：空参数集，与等值规则形状一致
            _evidence(_NETWORK_ARGV_LOCATOR, environment_binding, observed_at),
        ),
        _declaration(
            _NETWORK_NONE_CAPABILITY, "unavailable", None,
            _evidence(_NETWORK_ABSENCE_LOCATOR, environment_binding, observed_at),
        ),
    )
    # Digest payload per the frozen contract: capability id + support state +
    # parameter targets + the execution binding.  Time-varying evidence
    # (observed_at/expires_at/locator) is deliberately excluded so the same
    # distribution and execution identity always digest to the same value.
    doc_fields = {
        "provider": DECLARATION_PROVIDER,
        "revision": DECLARATION_REVISION,
        "environment_binding": environment_binding,
        "declarations": [
            {
                "capabilityId": item.capability_id,
                "supportState": item.support_state,
                "targets": list(item.parameters.targets) if item.parameters is not None else [],
            }
            for item in declarations
        ],
    }
    return SandboxDeclarationDocument(
        provider=DECLARATION_PROVIDER, revision=DECLARATION_REVISION,
        environment_binding=environment_binding, declarations=declarations,
        digest=_document_digest(doc_fields),
    )


__all__ = ["DECLARATION_PROVIDER", "DECLARATION_REVISION", "sandbox_declaration_document"]
