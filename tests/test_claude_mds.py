"""Claude.md template CRUD + apply tests (CLI side)."""
from __future__ import annotations

import pytest

from agent_box import claude_mds, config, profile
from agent_box.profile import ProfileError

from _editor_mock import patch_editor, patch_editor_with_text


# --- CRUD -----------------------------------------------------------------

def test_claude_md_crud(tmp_agent_box_home):
    """add \u2192 list \u2192 show \u2192 edit \u2192 delete round-trip."""
    body_v1 = "# Decision Maker v1\n\nYou are a decision maker.\n"
    with patch_editor_with_text(body_v1):
        claude_mds.add_claude_md("claude", "decision-maker")

    listed = claude_mds.list_claude_mds("claude")
    assert len(listed) == 1
    assert listed[0]["id"] == "decision-maker"
    assert listed[0]["name"] == "decision-maker"

    shown = claude_mds.get_claude_md("claude", "decision-maker")
    assert shown is not None
    assert shown["content"] == body_v1

    # Edit
    body_v2 = "# Decision Maker v2\n\nUpdated role.\n"
    with patch_editor_with_text(body_v2):
        claude_mds.edit_claude_md("claude", "decision-maker")

    shown = claude_mds.get_claude_md("claude", "decision-maker")
    assert shown["content"] == body_v2

    # Delete
    claude_mds.delete_claude_md("claude", "decision-maker")
    assert claude_mds.get_claude_md("claude", "decision-maker") is None


def test_claude_md_duplicate(tmp_agent_box_home):
    with patch_editor_with_text("# A\n"):
        claude_mds.add_claude_md("claude", "a")
    with patch_editor():
        with pytest.raises(ProfileError, match="already exists"):
            claude_mds.add_claude_md("claude", "a")


# --- apply ----------------------------------------------------------------

def test_claude_md_apply(tmp_agent_box_home):
    """apply writes the prompt content to the profile's CLAUDE.md."""
    body = "# Decision Maker\n\nYou are a decision maker.\n"
    with patch_editor_with_text(body):
        claude_mds.add_claude_md("claude", "decision-maker")

    profile.create("mycc", "claude")
    claude_path = config.profile_agent_dir("mycc", "claude") / "CLAUDE.md"

    # Template CLAUDE.md exists but is empty; apply overwrites it.
    assert claude_path.is_file()
    assert claude_path.read_text(encoding="utf-8") == ""

    claude_mds.apply_claude_md("mycc", "decision-maker")

    assert claude_path.read_text(encoding="utf-8") == body

    # profiles.claude_md_ref updated.
    meta = profile.load_meta("mycc")
    assert meta["claude_md"] == "decision-maker"


def test_claude_md_apply_unknown(tmp_agent_box_home):
    """apply raises for unknown prompt id."""
    profile.create("mycc", "claude")
    with pytest.raises(ProfileError, match="not found"):
        claude_mds.apply_claude_md("mycc", "nope")


# --- upsert (bypass $EDITOR) -------------------------------------------

def test_upsert_claude_md_insert(tmp_agent_box_home):
    """upsert_claude_md creates a new row for a fresh id."""
    result = claude_mds.upsert_claude_md(
        "claude", "test-md-new",
        "# Hello\n\nbody\n",
        name="Test MD",
        description="for tests",
    )
    assert result["id"] == "test-md-new"
    assert result["name"] == "Test MD"
    assert result["description"] == "for tests"
    assert result["content"] == "# Hello\n\nbody\n"
    assert result["enabled"] == 1

    listed = claude_mds.list_claude_mds("claude")
    assert any(r["id"] == "test-md-new" for r in listed)


def test_upsert_claude_md_update_content(tmp_agent_box_home):
    """upsert_claude_md updates content; name/description preserved if omitted."""
    claude_mds.upsert_claude_md(
        "claude", "test-md-upd",
        "v1 body",
        name="Original", description="orig desc",
    )
    result = claude_mds.upsert_claude_md(
        "claude", "test-md-upd", "v2 body",
    )
    assert result["content"] == "v2 body"
    # name/description preserved when not passed
    assert result["name"] == "Original"
    assert result["description"] == "orig desc"


def test_upsert_claude_md_update_name_and_description(tmp_agent_box_home):
    """upsert_claude_md updates name/description when explicitly passed."""
    claude_mds.upsert_claude_md(
        "claude", "test-md-meta",
        "body",
        name="v1", description="d1",
    )
    result = claude_mds.upsert_claude_md(
        "claude", "test-md-meta", "body",
        name="v2", description="d2",
    )
    assert result["name"] == "v2"
    assert result["description"] == "d2"
