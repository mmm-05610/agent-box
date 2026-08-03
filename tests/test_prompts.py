"""Prompt apply tests — agent-box reads prompts from ACS only."""
from __future__ import annotations

import pytest

from agent_box import config
from agent_box.resources import profile
from agent_box.resources.prompts import apply_prompt
from agent_box.resources.profile import ProfileError


def test_prompt_apply(tmp_agent_box_home, acs_stub):
    """apply writes the prompt content from ACS to the profile's prompt file."""
    body = "# Decision Maker\n\nYou are a decision maker.\n"
    acs_stub.add_prompt("claude", "decision-maker", content=body)

    profile.create("mycc", "claude")
    claude_path = config.profile_agent_dir("mycc", "claude") / "CLAUDE.md"

    # Template prompt file exists but is empty; apply overwrites it.
    assert claude_path.is_file()
    assert claude_path.read_text(encoding="utf-8") == ""

    apply_prompt("mycc", "decision-maker")

    assert claude_path.read_text(encoding="utf-8") == body

    # profiles.prompt_ref updated.
    meta = profile.load_meta("mycc")
    assert meta["prompt"] == "decision-maker"


def test_prompt_apply_unknown(tmp_agent_box_home):
    """apply raises for unknown prompt id."""
    profile.create("mycc", "claude")
    with pytest.raises(ProfileError, match="not found in ACS"):
        apply_prompt("mycc", "nope")
