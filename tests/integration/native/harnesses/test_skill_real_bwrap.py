"""Real no-model Skill loading probes through bwrap and managed tmux."""
from pathlib import Path
import shutil
import subprocess
import uuid
import time

import pytest

from agent_box.extensions.runtime_composition.protocol import content_digest
from agent_box_harnesses.adapters.skill_observation import observe_loaded_marker
from agent_box_skills.store import SkillStore


def _skill(store_root: Path):
    source = store_root.parent / "source"; source.mkdir()
    (source / "SKILL.md").write_text("---\nname: offline\ndescription: offline proof\n---\n# marker\n", encoding="utf-8")
    store = SkillStore(store_root)
    value = store.import_directory(source)
    return store, value


def _bwrap_args(tree: Path, target: str, command: tuple[str, ...]):
    args = ["bwrap", "--die-with-parent", "--new-session", "--unshare-user", "--unshare-pid", "--unshare-ipc", "--unshare-uts", "--unshare-net", "--dir", "/"]
    for system in ("/usr", "/bin", "/lib", "/lib64", "/etc"):
        if Path(system).exists(): args += ["--ro-bind", system, system]
    args += ["--proc", "/proc", "--dir", "/runtime", "--dir", "/runtime/home", "--ro-bind", str(tree), target, "--clearenv", "--", *command]
    return args


def test_five_harness_targets_read_skill_in_real_bwrap(tmp_path):
    store, value = _skill(tmp_path / "store")
    resolved = store.resolve(value.contract_id, store.ref(value.skill_id))
    assert store.ref(value.skill_id).metadata["digest"] == value.digest
    target = "/runtime/home/skills/offline"
    for harness in ("codex", "claude-code", "opencode", "hermes", "pi"):
        code = f"from pathlib import Path; p=Path('/runtime/home/skills/offline/SKILL.md'); assert p.is_file(); print('SKILL_LOADED:{resolved.skill_id}:{resolved.digest}')"
        result = subprocess.run(_bwrap_args(resolved.source.projection_source(), target, ("/usr/bin/python3", "-c", code)), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        evidence = observe_loaded_marker(marker=result.stdout.strip(), skill_id=resolved.skill_id, revision=resolved.revision, digest=resolved.digest)
        assert evidence.level == "LOADED" and "CONSUMED" not in evidence.level
        assert not (resolved.source.projection_source() / "SKILL.md").is_symlink()


def test_managed_tmux_reads_projected_skill_without_auto_finish(tmp_path):
    store, value = _skill(tmp_path / "store")
    resolved = store.resolve(value.contract_id, store.ref(value.skill_id))
    if shutil.which("tmux") is None: pytest.skip("real tmux binary unavailable")
    socket = f"ab-skill-{uuid.uuid4().hex[:12]}"
    target = tmp_path / "guest" / "runtime" / "home" / "skills" / "offline"; target.parent.mkdir(parents=True); shutil.copytree(resolved.source.projection_source(), target)
    session = "skill-proof"; state = {"phase": "ACTIVE", "finished": False}
    try:
        code = f"from pathlib import Path; import time; p=Path({str(target / 'SKILL.md')!r}); assert p.is_file(); print('SKILL_LOADED:{resolved.skill_id}:{resolved.digest}'); time.sleep(2)"
        subprocess.run(["tmux", "-L", socket, "new-session", "-d", "-s", session, "/usr/bin/python3", "-c", code], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        output = ""
        for _ in range(20):
            time.sleep(0.1)
            output = subprocess.run(["tmux", "-L", socket, "capture-pane", "-p", "-t", session], check=True, stdout=subprocess.PIPE, text=True).stdout
            if "SKILL_LOADED:" in output:
                break
        evidence = observe_loaded_marker(marker=output.strip(), skill_id=resolved.skill_id, revision=resolved.revision, digest=resolved.digest)
        assert evidence.level == "LOADED"
        assert state["phase"] == "ACTIVE" and state["finished"] is False
        state["finished"] = True
        assert state["finished"] is True
        assert content_digest(resolved.source.projection_source()) == value.digest
    finally:
        subprocess.run(["tmux", "-L", socket, "kill-server"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert store.get(value.skill_id).digest == value.digest
