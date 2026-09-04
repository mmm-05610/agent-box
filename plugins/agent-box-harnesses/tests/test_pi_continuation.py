"""Pi continuation contract and resource-provider round-trips.

Proves the Pi-owned continuation authority end to end:

* ``PiContinuationResourceProvider.make_ref`` -> ``resolve`` ->
  ``PiContinuationV1`` with the session_file present and absent variants;
* the provider defaults and the contract's ``deepseek`` provider invariant;
* fail-closed rejects (empty/oversized/ill-shaped locators, ref mismatch);
* the generic ``GenericExecutionProvider.continuation_ref`` surface (built
  from the registry-declared continuation facts) resolves through the SAME
  Pi resource provider, so no second locator vocabulary exists.
"""
from __future__ import annotations

import pytest

from agent_box.work_core import Ref, RefType

from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider
from agent_box_harnesses.pi.contract import PiContinuationV1
from agent_box_harnesses.pi.continuation import PiContinuationResourceProvider
from helpers import definition_by_driver

UUID_SHAPED_ID = "3f2b9c1e-7a44-4c1d-9e0b-52a4f6c1d8e0"
SESSION_FILE = "/runtime/home/.pi/agent/sessions/3f2b9c1e.jsonl"


def test_round_trip_with_session_file():
    provider = PiContinuationResourceProvider()
    ref = provider.make_ref(UUID_SHAPED_ID, session_file=SESSION_FILE)
    assert ref.type is RefType.SESSION
    assert ref.provider == "pi-session"
    assert ref.native_id == UUID_SHAPED_ID
    assert ref.metadata["harness_type"] == "pi"
    assert ref.metadata["source_provider"] == "pi"
    assert ref.metadata["session_file"] == SESSION_FILE
    resolved = provider.resolve(PiContinuationV1.contract_id, ref)
    assert isinstance(resolved, PiContinuationV1)
    assert resolved.session_id == UUID_SHAPED_ID
    assert resolved.session_file == SESSION_FILE
    # the contract's frozen provider default (pi ships the deepseek catalog)
    assert resolved.provider == "deepseek"


def test_round_trip_without_session_file():
    provider = PiContinuationResourceProvider()
    ref = provider.make_ref(UUID_SHAPED_ID)
    assert "session_file" not in ref.metadata
    resolved = provider.resolve(PiContinuationV1.contract_id, ref)
    assert resolved.session_id == UUID_SHAPED_ID
    assert resolved.session_file is None
    assert resolved.provider == "deepseek"


def test_make_ref_rejects_locators_the_contract_could_never_resolve():
    provider = PiContinuationResourceProvider()
    with pytest.raises(ValueError):
        provider.make_ref("")
    with pytest.raises(ValueError):
        provider.make_ref("   ")
    # over the contract's 128-char identity bound: a truncated locator would
    # be a fabricated session identity, so this fails closed at make_ref
    with pytest.raises(ValueError):
        provider.make_ref("s" * 129)
    with pytest.raises(ValueError):
        provider.make_ref("bad id with spaces")
    with pytest.raises(ValueError):
        provider.make_ref(UUID_SHAPED_ID, session_file="relative/path.jsonl")


def test_resolve_rejects_ref_mismatch_fail_closed():
    provider = PiContinuationResourceProvider()
    ref = provider.make_ref(UUID_SHAPED_ID)
    with pytest.raises(ValueError):
        provider.resolve("agent-box-codex.continuation@1", ref)
    with pytest.raises(ValueError):
        provider.resolve(PiContinuationV1.contract_id, Ref(RefType.SESSION, "codex-continuation", UUID_SHAPED_ID))
    with pytest.raises(ValueError):
        provider.resolve(PiContinuationV1.contract_id, Ref(RefType.ARTIFACT, "pi-session", UUID_SHAPED_ID))
    # a ref that bypasses make_ref with a contract-invalid identity is a
    # typed contract rejection at resolve time
    with pytest.raises(ValueError):
        provider.resolve(PiContinuationV1.contract_id, Ref(RefType.SESSION, "pi-session", "x" * 200))


def test_generic_continuation_ref_resolves_through_pi_provider():
    """The provider's registry-fact continuation Ref and the Pi resource
    provider are one vocabulary: generic make -> Pi resolve."""
    definition = definition_by_driver("pi")
    provider = GenericExecutionProvider(definition, ADAPTERS["pi"])
    assert provider.continuation_contract_id() == PiContinuationV1.contract_id
    ref = provider.continuation_ref(UUID_SHAPED_ID, extra_metadata={"session_file": SESSION_FILE})
    assert ref.provider == "pi-session"
    assert ref.metadata["harness_type"] == "pi"
    assert ref.metadata["source_provider"] == "pi"
    resolved = PiContinuationResourceProvider().resolve(PiContinuationV1.contract_id, ref)
    assert resolved.session_id == UUID_SHAPED_ID
    assert resolved.session_file == SESSION_FILE


def test_generic_continuation_ref_bounds_are_fail_closed():
    definition = definition_by_driver("pi")
    provider = GenericExecutionProvider(definition, ADAPTERS["pi"])
    from agent_box_harnesses.adapters.failures import PlanRejected

    with pytest.raises(PlanRejected):
        provider.continuation_ref("")
    with pytest.raises(PlanRejected):
        provider.continuation_ref("x" * 257)
    # extra metadata is bounded and string-only
    with pytest.raises(PlanRejected):
        provider.continuation_ref(UUID_SHAPED_ID, extra_metadata={"session_file": 7})
