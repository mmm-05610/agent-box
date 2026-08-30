from pathlib import Path
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
