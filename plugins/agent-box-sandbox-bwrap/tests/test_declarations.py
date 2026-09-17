"""Behavior contract for the per-execution bwrap declaration document.

The module under test is a black box: given the deployment-derived targets of
one execution it either produces a digest-stamped, execution-bound declaration
document or refuses a target its grammar cannot express.  These tests pin the
claims a matcher will later rely on — which capabilities are declared, with
which support states and parameter coverage, and what the evidence trail
binds — never the spelling of the implementation.
"""
from __future__ import annotations

import pytest

from agent_box.extensions.capability import (
    RequirementParameterSet, SandboxDeclarationDocument,
)
from agent_box_sandbox_bwrap.declarations import (
    DECLARATION_PROVIDER, DECLARATION_REVISION, sandbox_declaration_document,
)
from agent_box_sandbox_bwrap.provider import ProjectionRejected

BINDING = "ubuntu-24.04:conn-7:/srv/remote-view"
OBSERVED_AT = 1_768_000_000

# Targets that fall inside the fixed template's enforceable namespaces: the
# executable namespace (provider.py argv builder), the guest-home projection
# grammar, and the digest-verified runtime artifact namespace.
READONLY = ("/runtime/bin/worker", "/runtime/home/auth.json", "/runtime/artifacts/pkgs")
WRITABLE = ("/runtime/home/.fixture/state",)


def _document():
    return sandbox_declaration_document(
        readonly_targets=READONLY, writable_targets=WRITABLE,
        environment_binding=BINDING, observed_at=OBSERVED_AT,
    )


def _by_id(document, capability_id):
    matches = [d for d in document.declarations if d.capability_id == capability_id]
    assert len(matches) == 1, f"expected exactly one {capability_id} declaration"
    return matches[0]


def test_document_carries_the_four_frozen_declarations_bound_to_one_execution():
    document = _document()
    assert isinstance(document, SandboxDeclarationDocument)
    assert document.provider == DECLARATION_PROVIDER == "sandbox-bwrap"
    assert document.revision == DECLARATION_REVISION == 1
    assert document.environment_binding == BINDING
    assert [d.capability_id for d in document.declarations] == [
        "filesystem.readonly@1", "filesystem.writable@1",
        "network.inherit@1", "network.none@1",
    ]
    for declaration in document.declarations:
        assert declaration.provider == "sandbox-bwrap"
        assert declaration.condition is None
    assert _by_id(document, "filesystem.readonly@1").support_state == "supported"
    assert _by_id(document, "filesystem.writable@1").support_state == "supported"
    assert _by_id(document, "network.inherit@1").support_state == "supported"


def test_network_none_declares_unavailable_without_parameters():
    declaration = _by_id(_document(), "network.none@1")
    assert declaration.support_state == "unavailable"
    assert declaration.parameters is None
    inherit = _by_id(_document(), "network.inherit@1")
    assert isinstance(inherit.parameters, RequirementParameterSet)
    assert inherit.parameters.targets == ()  # 无参数面：空参数集，可被等值规则满足


def test_digest_is_stable_across_constructions_and_tracks_the_declared_content():
    document = _document()
    again = _document()
    assert document.digest == again.digest
    assert len(document.digest) == 64
    assert set(document.digest) <= set("0123456789abcdef")
    narrowed = sandbox_declaration_document(
        readonly_targets=READONLY[:-1], writable_targets=WRITABLE,
        environment_binding=BINDING, observed_at=OBSERVED_AT,
    )
    rebound = sandbox_declaration_document(
        readonly_targets=READONLY, writable_targets=WRITABLE,
        environment_binding="another-environment", observed_at=OBSERVED_AT,
    )
    assert narrowed.digest != document.digest
    assert rebound.digest != document.digest


def test_targets_reach_their_own_declaration_sorted():
    document = sandbox_declaration_document(
        readonly_targets=tuple(reversed(READONLY)),
        writable_targets=tuple(reversed(WRITABLE)),
        environment_binding=BINDING, observed_at=OBSERVED_AT,
    )
    readonly = _by_id(document, "filesystem.readonly@1")
    writable = _by_id(document, "filesystem.writable@1")
    assert isinstance(readonly.parameters, RequirementParameterSet)
    assert isinstance(writable.parameters, RequirementParameterSet)
    assert readonly.parameters.targets == tuple(sorted(READONLY))
    assert writable.parameters.targets == tuple(sorted(WRITABLE))
    assert readonly.parameters.targets == tuple(sorted(readonly.parameters.targets))
    assert writable.parameters.targets == tuple(sorted(writable.parameters.targets))


def test_evidence_binds_the_execution_and_never_expires():
    document = _document()
    expected_locators = {
        "filesystem.readonly@1": "provider.py:compile_remote_sidecar_bwrap_argv",
        "filesystem.writable@1": "provider.py:compile_remote_sidecar_bwrap_argv",
        # Row anchors adapted to this tree: the sidecar argv block lives at
        # provider.py:297-300 here (source branch had 259-263).
        "network.inherit@1": "provider.py:297-300",
        "network.none@1": "provider.py:297-300(absence)",
    }
    for declaration in document.declarations:
        assert len(declaration.evidence) == 1
        (ref,) = declaration.evidence
        assert ref.kind == "file-symbol"
        assert ref.locator == expected_locators[declaration.capability_id]
        assert ref.environment_binding == BINDING
        assert ref.observed_at == OBSERVED_AT
        assert ref.expires_at is None


@pytest.mark.parametrize("bad_target", [
    "../x",           # escapes the root
    "a//b",           # empty segment: not canonical
    "relative/path",  # not absolute
    "/with\x00null",  # NUL
    "/trailing/",     # not its own PurePosixPath spelling
    "/etc/passwd",    # canonical but outside every enforceable namespace
    "/runtime/home\x00",  # NUL inside the home prefix
])
def test_unenforceable_readonly_target_is_refused(bad_target):
    with pytest.raises(ProjectionRejected):
        sandbox_declaration_document(
            readonly_targets=(bad_target,), writable_targets=(),
            environment_binding=BINDING, observed_at=OBSERVED_AT,
        )


def test_writable_targets_are_held_to_the_home_directory_grammar():
    # a//b is non-canonical; /etc is canonical but never writable in the template.
    for bad_target in ("a//b", "/etc"):
        with pytest.raises(ProjectionRejected):
            sandbox_declaration_document(
                readonly_targets=(), writable_targets=(bad_target,),
                environment_binding=BINDING, observed_at=OBSERVED_AT,
            )


def test_digest_is_time_invariant():
    # The frozen contract digests targets + binding only: the same distribution
    # and execution identity must digest identically regardless of when the
    # posture was observed.
    first = sandbox_declaration_document(
        readonly_targets=READONLY, writable_targets=WRITABLE,
        environment_binding=BINDING, observed_at=OBSERVED_AT,
    )
    later = sandbox_declaration_document(
        readonly_targets=READONLY, writable_targets=WRITABLE,
        environment_binding=BINDING, observed_at=OBSERVED_AT + 86_400,
    )
    assert first.digest == later.digest


def test_real_document_satisfies_network_and_readonly_demands_through_the_matcher():
    """BC-005 end-to-end: the real per-execution document must actually match.

    A document the plugin produces is fed, unmodified, into the public matcher
    alongside deployment-shaped demands and grants: network.inherit (empty
    parameter surface) and a readonly demand over one declared home projection
    target must both be satisfied — the declaration shapes are not test-only.
    """
    from agent_box.extensions import capability

    document = _document()
    readonly_target = "/runtime/home/auth.json"
    requirements = (
        capability.SandboxRequirement(
            capability_id="network.inherit@1",
            parameters=capability.RequirementParameterSet(),
            source=capability.EvidenceRef(
                kind="config-key", locator="deployment:adapter",
                environment_binding=None, observed_at=None, expires_at=None,
            ),
        ),
        capability.SandboxRequirement(
            capability_id="filesystem.readonly@1",
            parameters=capability.RequirementParameterSet(targets=(readonly_target,)),
            source=capability.EvidenceRef(
                kind="config-key", locator="deployment:projection_targets",
                environment_binding=None, observed_at=None, expires_at=None,
            ),
        ),
    )
    grants = (
        capability.SandboxGrant(
            capability_id="network.inherit@1",
            parameters=capability.RequirementParameterSet(),
            provenance="locked-policy",
            source=capability.EvidenceRef(
                kind="config-key", locator="deployment:adapter",
                environment_binding=None, observed_at=None, expires_at=None,
            ),
        ),
        capability.SandboxGrant(
            capability_id="filesystem.readonly@1",
            parameters=capability.RequirementParameterSet(targets=(readonly_target,)),
            provenance="locked-policy",
            source=capability.EvidenceRef(
                kind="config-key", locator="deployment:projection_targets",
                environment_binding=None, observed_at=None, expires_at=None,
            ),
        ),
    )
    outcome = capability.match_requirements(
        requirements, grants, document,
        context=capability.MatchContext(environment_binding=BINDING, now=OBSERVED_AT),
    )
    assert outcome.satisfied, outcome.refusals
    assert {item.capability_id for item in outcome.matches} == {
        "network.inherit@1", "filesystem.readonly@1",
    }


def test_cross_target_relations_are_enforced_like_the_compiler():
    """BC-R2-001: combinations the real compiler refuses must not be declared.

    provider.py re-checks duplicates, projection-file ancestor overlap and the
    state/projection relations on the exact argv; the declaration document must
    accept exactly the combination set the compiler can still enforce.
    """
    # duplicate across readonly and writable faces
    with pytest.raises(ProjectionRejected):
        sandbox_declaration_document(
            readonly_targets=("/runtime/home/dual",),
            writable_targets=("/runtime/home/dual",),
            environment_binding=BINDING, observed_at=OBSERVED_AT,
        )
    # one projected file cannot also be another file's parent directory
    with pytest.raises(ProjectionRejected):
        sandbox_declaration_document(
            readonly_targets=("/runtime/home/a", "/runtime/home/a/b"),
            writable_targets=(),
            environment_binding=BINDING, observed_at=OBSERVED_AT,
        )
    # the writable state directory cannot be a projected file itself
    with pytest.raises(ProjectionRejected):
        sandbox_declaration_document(
            readonly_targets=("/runtime/home/state",),
            writable_targets=("/runtime/home/state",),
            environment_binding=BINDING, observed_at=OBSERVED_AT,
        )
    # nor can the state directory live inside a projected file
    with pytest.raises(ProjectionRejected):
        sandbox_declaration_document(
            readonly_targets=("/runtime/home/auth.json",),
            writable_targets=("/runtime/home/auth.json/state",),
            environment_binding=BINDING, observed_at=OBSERVED_AT,
        )
    # the compiler-representable combination still constructs
    document = sandbox_declaration_document(
        readonly_targets=("/runtime/home/auth.json",),
        writable_targets=("/runtime/home/state",),
        environment_binding=BINDING, observed_at=OBSERVED_AT,
    )
    assert _by_id(document, "filesystem.writable@1").parameters.targets == (
        "/runtime/home/state",
    )
