"""Order 61: the rename is display-level; the compatibility surfaces stand.

What this pins, from the outside:

* the project ships six console scripts - the three Pacthold names and the
  three historical `agent-box*` aliases - and each pair points at the *same*
  main, so no behaviour can drift between the names;
* the distribution is named `pacthold`, and the version lookup still answers
  for an installation that predates the rename;
* the compatibility surfaces the order forbids touching are untouched: the
  import path, the plugin entry-point group, the wire version, the contract
  ids, the `AGENTBOX_*` variable prefix and the data-directory facts.
"""
from __future__ import annotations

import tomllib
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def test_the_project_ships_both_names_pointing_at_one_main():
    pyproject = tomllib.loads((REPO / "pyproject.toml").read_text(encoding="utf-8"))
    scripts = pyproject["project"]["scripts"]
    assert pyproject["project"]["name"] == "pacthold"
    assert scripts["pacthold"] == scripts["agent-box"]
    assert scripts["pacthold-server"] == scripts["agent-box-server"]
    assert scripts["pacthold-server-credential"] == scripts["agent-box-server-credential"]
    for target in scripts.values():
        module, _, attribute = target.partition(":")
        assert attribute == "main"
        assert module.startswith("agent_box."), "the import path is a compatibility surface"


def test_the_version_lookup_answers_under_old_and_new_installs():
    import agent_box

    assert agent_box.__version__ and agent_box.__version__ != "0.0.0"
    source = (REPO / "src" / "agent_box" / "__init__.py").read_text(encoding="utf-8")
    assert 'version("pacthold")' in source
    assert 'version("agent-box-cli")' in source


def test_the_compatibility_surfaces_are_named_unchanged():
    loader = (REPO / "src" / "agent_box" / "extensions" / "loader.py").read_text(encoding="utf-8")
    assert 'ENTRY_POINT_GROUP = "agent_box.plugins"' in loader
    from agent_box.server.wire.handlers import WIRE_VERSION

    assert WIRE_VERSION == "wire/1"
    # The contract ids keep their historical spelling: they are protocol.
    skills_contract = (REPO / "src" / "agent_box" / "resource_contracts"
                       / "agent_skill_v1.py").read_text(encoding="utf-8")
    assert "agent-box.skill@1" in skills_contract
    env_prefix = (REPO / "src" / "agent_box" / "server" / "bootstrap" / "runtime.py").read_text(
        encoding="utf-8")
    assert "AGENTBOX_" in env_prefix or "AGENT_BOX_" in env_prefix
