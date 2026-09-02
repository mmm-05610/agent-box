"""Determined repair F: Composer dedupe / conflict / collision rules."""
import pytest

from agent_box_harnesses.adapters.composer import (
    CandidateFile, CompositionConflict, compose, content_digest_bytes,
)


def test_same_semantic_key_and_value_dedupes():
    target = compose((
        CandidateFile("/runtime/home/settings.json", b"{}", "profile-config", "agent-box.profile@1"),
        CandidateFile("/runtime/home/settings.json", b"{}", "profile-config", "agent-box.profile@1"),
    ))
    assert len(target.files) == 1


def test_same_semantic_key_different_value_is_a_typed_conflict():
    with pytest.raises(CompositionConflict, match="SEMANTIC_KEY_CONFLICT"):
        compose((
            CandidateFile("/runtime/home/settings.json", b"a", "profile-config", "agent-box.profile@1"),
            CandidateFile("/runtime/home/settings.json", b"b", "profile-config", "agent-box.profile@1"),
        ))


def test_different_semantic_keys_on_one_guest_target_collide():
    with pytest.raises(CompositionConflict, match="GUEST_TARGET_AUTHORITY_COLLISION"):
        compose((
            CandidateFile("/runtime/home/settings.json", b"{}", "profile-config", "agent-box.profile@1"),
            CandidateFile("/runtime/home/settings.json", b"{}", "skill:settings", "agent-box.skill@1"),
        ))


def test_same_owner_replace_policy_is_the_only_override():
    # an explicit field-level policy of the SAME owner may supersede its own
    # earlier fragment; cross-owner overrides never exist
    target = compose((
        CandidateFile("/runtime/home/settings.json", b"old", "profile-config", "agent-box.profile@1"),
        CandidateFile("/runtime/home/settings.json", b"new", "profile-config", "agent-box.profile@1", policy="same-owner-replace"),
    ))
    assert target.files[0].content == b"new"
    with pytest.raises(CompositionConflict, match="SEMANTIC_KEY_CONFLICT"):
        compose((
            CandidateFile("/runtime/home/settings.json", b"old", "profile-config", "owner-a"),
            CandidateFile("/runtime/home/settings.json", b"new", "profile-config", "owner-b", policy="same-owner-replace"),
        ))


def test_no_priority_override_exists():
    # fragments carry no priority field at all
    assert "priority" not in CandidateFile.__dataclass_fields__


def test_rendered_target_digests_are_content_bound():
    target = compose((CandidateFile("/runtime/home/cfg", b"content", "k", "o"),))
    assert target.files[0].digest == content_digest_bytes(b"content")


def test_distinct_semantic_keys_distinct_targets_compose():
    target = compose((
        CandidateFile("/runtime/home/.codex/config.toml", b"a", "profile-config", "agent-box.profile@1"),
        CandidateFile("/runtime/home/.agents/skills/review/SKILL.md", b"b", "skill:review", "agent-box.skill@1"),
    ))
    assert len(target.files) == 2
