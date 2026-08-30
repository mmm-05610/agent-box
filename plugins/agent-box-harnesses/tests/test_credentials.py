from pathlib import Path
from agent_box_harnesses.codex.credentials import CodexCredentialSource
from agent_box_harnesses.codex.launch import CodexLaunchAdapter
from agent_box_harnesses.profiles.projection import Projection
from agent_box_harnesses.profiles.repository import ProfileRepository
from agent_box.resource_contracts import AgentBoxProfileV1, WorkspaceV1
import pytest


def test_codex_login_is_a_controlled_link_and_cleanup_preserves_source(tmp_path):
    source=tmp_path/"home/.codex/auth.json"; source.parent.mkdir(parents=True); source.write_text("TOP_SECRET")
    root=tmp_path/"projection"; root.mkdir()
    adapter=CodexCredentialSource(home=tmp_path/"home")
    result=adapter.project(root,{"provider":"codex","native_locator":"codex-login/default"})
    assert result=={"identity":"codex-login/default","method":"controlled-symlink","materialized":True}
    assert (root/"auth.json").is_symlink() and (root/"auth.json").resolve()==source.resolve()
    assert "TOP_SECRET" not in str(result)
    adapter.cleanup(root); assert not (root/"auth.json").exists(); assert source.read_text()=="TOP_SECRET"


def test_unsupported_or_missing_codex_login_fails_closed(tmp_path):
    adapter=CodexCredentialSource(home=tmp_path/"home")
    with pytest.raises(ValueError,match="UNSUPPORTED"):
        adapter.validate({"provider":"file","native_locator":"/tmp/auth.json"})
    with pytest.raises(ValueError,match="UNAVAILABLE"):
        adapter.project(tmp_path/"projection",{"provider":"codex","native_locator":"codex-login/default"})


def test_launch_environment_is_bounded_and_sandbox_mode_is_not_external(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "SECRET_ENV")
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:7890")
    monkeypatch.setenv("no_proxy", "127.0.0.1,localhost")
    monkeypatch.setenv("UNRELATED_RUNTIME_VALUE", "must-not-pass")
    repo=ProfileRepository(tmp_path/"profiles")
    value=repo.save({"profile_id":"safe","name":"Safe","config":{"model":"gpt-5","environment":{"SAFE_RUNTIME":"yes"}}})
    projection=Projection(tmp_path/"projections",repo)
    ref=repo.ref("safe",1).as_ref()
    plan=CodexLaunchAdapter(projection,binary="/bin/true").plan(execution_id="E1",profile_ref=ref,profile=AgentBoxProfileV1("safe","codex",value["digest"],1,"codex-profile"),workspace=WorkspaceV1(tmp_path,"test"))
    assert "OPENAI_API_KEY" not in plan.env and "SECRET_ENV" not in str(plan.env)
    assert plan.env["HTTPS_PROXY"] == "http://127.0.0.1:7890"
    assert plan.env["no_proxy"] == "127.0.0.1,localhost"
    assert "UNRELATED_RUNTIME_VALUE" not in plan.env
    assert plan.env["CODEX_HOME"].endswith("/E1")
    assert plan.profile_revision == 1
    assert plan.profile_digest == value["digest"]
    assert plan.projection_directory == Path(plan.env["CODEX_HOME"])
    assert plan.cleanup_directory == plan.projection_directory
    assert plan.projected_config_paths == (plan.projection_directory / "config.toml",)
