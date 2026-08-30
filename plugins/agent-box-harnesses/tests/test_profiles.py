from pathlib import Path
import pytest
from agent_box.resource_contracts import AgentBoxProfileV1
from agent_box.work_core import Ref, RefType
from agent_box_harnesses.codex.runtime import CodexProfileProvider
from agent_box_harnesses.profiles.repository import ProfileRepository
from agent_box_harnesses.profiles.projection import Projection

def test_revisions_are_immutable_and_exact(tmp_path: Path):
    repo=ProfileRepository(tmp_path/"profiles")
    p1=repo.save({"profile_id":"main","name":"Main","config":{"model":"gpt-5"}})
    p2=repo.save({"profile_id":"main","name":"Main","config":{"model":"gpt-5-mini"}},p1["revision"])
    assert p1["revision"] == 1 and p2["revision"] == 2 and p1["digest"] != p2["digest"]
    assert repo.get("main",1)["config"]["model"] == "gpt-5"
    assert repo.ref("main",1).digest == p1["digest"]

def test_projection_is_execution_scoped_and_redacted(tmp_path: Path):
    repo=ProfileRepository(tmp_path/"profiles")
    p=repo.save({"profile_id":"main","name":"Main","config":{"model":"gpt-5","environment":{"SAFE":"value"}},"capability_refs":[{"provider":"mcp","id":"docs@1"}]})
    projection=Projection(tmp_path/"projections",repo)
    a=projection.materialize("E1",repo.ref("main",1)); b=projection.materialize("E2",repo.ref("main",1))
    assert a["directory"] != b["directory"]
    assert a["manifest"]["shared_capability_refs"] == b["manifest"]["shared_capability_refs"]
    assert "value" not in (Path(a["directory"])/"manifest.json").read_text()
    assert a["manifest"]["credential_projection"]["method"] == "none"

def test_secret_fields_and_digest_drift_rejected(tmp_path: Path):
    repo=ProfileRepository(tmp_path/"profiles")
    try: repo.save({"profile_id":"bad","name":"Bad","config":{"api_key":"never"}})
    except ValueError as exc: assert str(exc)=="SECRET_FIELD_FORBIDDEN"
    else: raise AssertionError("secret field accepted")


def test_profile_digest_compatibility_and_direct_provider_resolution(tmp_path: Path):
    provider = CodexProfileProvider(tmp_path)
    value = provider.repo.save({"profile_id": "main", "name": "Main", "config": {"model": "gpt-5"}})
    # Compatibility pin for the pre-extraction Harness JSON digest algorithm.
    assert value["digest"] == "sha256:e54bf82297adedb9c9c10844e5a6558e3ae569195dccfd1c7a22a0b053d8d4c0"
    ref = provider.make_ref("main", 1)
    resolved = provider.resolve(AgentBoxProfileV1.contract_id, ref)
    assert resolved == AgentBoxProfileV1("main", "codex", value["digest"], 1, "codex-profile")
    with pytest.raises(ValueError, match="PROFILE_DIGEST_DRIFT"):
        provider.resolve(
            AgentBoxProfileV1.contract_id,
            Ref(RefType.ARTIFACT, "codex-profile", "main", metadata={"harness_id": "codex", "revision": "1", "digest": "sha256:drift"}),
        )


def test_projection_overlay_is_execution_local_and_shared_refs_are_stable(tmp_path: Path):
    repo = ProfileRepository(tmp_path / "profiles")
    value = repo.save({
        "profile_id": "shared",
        "name": "Shared",
        "config": {"model": "gpt-5"},
        "capability_refs": [{"provider": "artifact-file", "native_id": "artifact-1", "digest": "sha256:artifact"}],
    })
    projection = Projection(tmp_path / "projections", repo)
    first = projection.materialize("execution-1", repo.ref("shared", 1))
    second = projection.materialize("execution-2", repo.ref("shared", 1))
    first_overlay = Path(first["directory"]) / "overlay" / "session.json"
    second_overlay = Path(second["directory"]) / "overlay" / "session.json"
    first_overlay.write_text("first", encoding="utf-8")
    second_overlay.write_text("second", encoding="utf-8")
    assert first["directory"] != second["directory"]
    assert first_overlay.read_text() == "first"
    assert second_overlay.read_text() == "second"
    assert first["manifest"]["shared_capability_refs"] == second["manifest"]["shared_capability_refs"] == value["capability_refs"]
