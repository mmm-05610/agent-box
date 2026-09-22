from pathlib import Path
import pytest

from agent_box_skills.store import SkillStore


def make_skill(root: Path, name="review-skill"):
    root.mkdir()
    (root / "SKILL.md").write_text(f"---\nname: {name}\ndescription: Review safely.\n---\n# Review\n", encoding="utf-8")
    return root


def test_import_exact_ref_and_replay_are_stable(tmp_path):
    store = SkillStore(tmp_path / "plugins" / "skills")
    source = make_skill(tmp_path / "source")
    first = store.import_directory(source)
    replay = store.import_directory(source)
    assert first.revision == replay.revision == 1
    assert first.digest == replay.digest
    ref = store.ref(first.skill_id)
    resolved = store.resolve(first.contract_id, ref)
    assert resolved.digest == first.digest
    assert "path" not in resolved.public_dict()
    assert "source" not in repr(resolved)


def test_expected_revision_creates_immutable_revision_and_cas(tmp_path):
    store = SkillStore(tmp_path / "store")
    source = make_skill(tmp_path / "source")
    first = store.import_directory(source)
    (source / "SKILL.md").write_text("---\nname: review-skill\ndescription: Changed.\n---\nnew\n", encoding="utf-8")
    second = store.import_directory(source, expected_revision=1)
    assert (store.get("review-skill", 1).digest == first.digest)
    assert second.revision == 2 and second.digest != first.digest
    with pytest.raises(ValueError, match="REVISION_CONFLICT"):
        store.import_directory(source, expected_revision=1)


@pytest.mark.parametrize("case", ["missing", "frontmatter", "traversal", "symlink"])
def test_rejects_unsafe_or_invalid_skill(tmp_path, case):
    source = tmp_path / "source"; source.mkdir()
    if case == "missing":
        pass
    elif case == "frontmatter":
        (source / "SKILL.md").write_text("# no manifest", encoding="utf-8")
    elif case == "traversal":
        (source / "SKILL.md").write_text("---\nname: x\ndescription: x\n---\n[x](../outside)\n", encoding="utf-8")
    else:
        (source / "SKILL.md").write_text("---\nname: x\ndescription: x\n---\n", encoding="utf-8")
        (source / "link").symlink_to(source / "SKILL.md")
    with pytest.raises(ValueError):
        SkillStore(tmp_path / "store").import_directory(source)


def test_disable_and_old_provider_are_fail_closed(tmp_path):
    store = SkillStore(tmp_path / "store")
    first = store.import_directory(make_skill(tmp_path / "source"))
    disabled = store.disable(first.skill_id, 1)
    assert disabled.revision == 2
    with pytest.raises(KeyError, match="SKILL_DISABLED"):
        store.get(first.skill_id)
    with pytest.raises(ValueError, match="SKILL_REF_MISMATCH"):
        store.resolve(first.contract_id, store.ref(first.skill_id, 1).__class__(store.ref(first.skill_id, 1).type, "pi-profile", first.skill_id, metadata={"revision": "1", "digest": first.digest, "format": "agent-skills"}))


def test_disable_failure_leaves_no_unowned_revision_directory(tmp_path):
    store = SkillStore(tmp_path / "store")
    first = store.import_directory(make_skill(tmp_path / "source"))
    store.disable(first.skill_id, 1)
    revisions = tmp_path / "store" / "skills" / first.skill_id / "revisions"
    before = sorted(p.name for p in revisions.iterdir())
    # Gap A is closed by the R-6/INC2 token guard, so the stale token is refused
    # before any revision directory is built; this example keeps pinning only the
    # compensation (it stays valid whatever the failure turns into).
    try:
        store.disable(first.skill_id, 1)
    except Exception:
        pass
    assert sorted(p.name for p in revisions.iterdir()) == before


def test_disable_stale_token_is_typed_conflict_before_any_revision(tmp_path):
    store = SkillStore(tmp_path / "store")
    first = store.import_directory(make_skill(tmp_path / "source"))
    disabled = store.disable(first.skill_id, 1)
    assert disabled.revision == 2
    revisions = tmp_path / "store" / "skills" / first.skill_id / "revisions"
    before = sorted(p.name for p in revisions.iterdir())
    # The same token and the same shape as import_directory: a stale token is a
    # typed refusal, not a bare OSError from the os.replace collision.
    with pytest.raises(ValueError, match="REVISION_CONFLICT"):
        store.disable(first.skill_id, 1)
    with pytest.raises(ValueError, match="REVISION_CONFLICT"):
        store.disable(first.skill_id, disabled.revision + 1)
    # Nothing was staged: no extra revision and no leftover temporary directory.
    assert sorted(p.name for p in revisions.iterdir()) == before == ["1", "2"]
    # The guard is deliberately no wider than the stale token: a skill with no
    # revision at all keeps the more specific not-found refusal.
    with pytest.raises(KeyError, match="SKILL_NOT_FOUND"):
        store.disable("no-such-skill", 1)
    # The tombstone token itself is still idempotent and still grows nothing.
    assert store.disable(first.skill_id, disabled.revision).revision == 2
    assert sorted(p.name for p in revisions.iterdir()) == ["1", "2"]


def test_disable_with_tombstone_revision_makes_no_new_revision(tmp_path):
    store = SkillStore(tmp_path / "store")
    first = store.import_directory(make_skill(tmp_path / "source"))
    disabled = store.disable(first.skill_id, 1)
    again = store.disable(first.skill_id, disabled.revision)
    assert again.revision == disabled.revision == 2
    assert sorted(p.name for p in (tmp_path / "store" / "skills" / first.skill_id / "revisions").iterdir()) == ["1", "2"]
