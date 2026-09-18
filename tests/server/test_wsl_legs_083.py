"""Work Order 083: the **real** WSL legs of 62 (`workspaces.gitStatus`) and 64 (`executions.list`).

62 shipped its WSL branch wired but never run (report §4: "连接器接线完成但未在 c11 上真跑"),
which is why 068 downgraded the row to PARTIAL. These tests drive the real
`WslConnector` over the real `wsl.exe` against a real repository, so the numbers
below are facts from the other side of the channel rather than fixture labels.

Two things distinguish this from `test_git_status.py`, which forced
`env_kind='local'`: the workspace record keeps its default `wsl` placement, and the
connector is the production class, so the command actually leaves this process
through `wsl.exe --distribution … --exec /usr/bin/git …`.
"""
from __future__ import annotations

import getpass
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from agent_box.server.bootstrap import build_runtime

DISTRIBUTION = "Ubuntu"

pytestmark = pytest.mark.skipif(
    shutil.which("wsl.exe") is None, reason="no wsl.exe channel on this host"
)


def _git_cwd(args, cwd: Path) -> None:
    subprocess.run(["git", *args], cwd=cwd, check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _channel_or_skip() -> None:
    """The leg is real only if wsl.exe can actually run git in the distribution."""
    probe = subprocess.run(
        ["wsl.exe", "--distribution", DISTRIBUTION, "--user", getpass.getuser(),
         "--exec", "/usr/bin/git", "--version"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60,
    )
    if probe.returncode != 0:
        raise pytest.skip(f"WSL channel cannot reach git: {probe.stderr[:200]!r}")


def _connector(tmp_path: Path):
    """The production connector, built the way the Windows side builds it.

    `read_only_git_status` never touches the Worker protocol, so the manifest only
    has to satisfy the constructor's shape check; the command it runs is real.
    """
    from agent_box_runtime_wsl.connector import WslConnector

    manifest = tmp_path / "worker-manifest.json"
    manifest.write_text(json.dumps({
        "schemaVersion": 1, "wireVersion": 1, "workerVersion": "083-leg",
        "sha256": "sha256:" + "0" * 64,
    }), encoding="utf-8")
    return WslConnector(
        manifest_path=manifest,
        linux_worker_path="/usr/local/bin/agent-box-worker",
        server_instance_id="083-wsl-leg",
    )


def _repository(tmp_path: Path) -> Path:
    """A real repo with an upstream, two unpushed commits and one dirty file."""
    remote = tmp_path / "remote.git"
    _git_cwd(["init", "--bare", "--initial-branch=main", "remote.git"], tmp_path)

    repo = tmp_path / "repo"
    repo.mkdir()
    _git_cwd(["init", "--initial-branch=main"], repo)
    _git_cwd(["config", "user.email", "leg@example.invalid"], repo)
    _git_cwd(["config", "user.name", "leg"], repo)
    (repo / "readme.md").write_text("base\n", encoding="utf-8")
    _git_cwd(["add", "readme.md"], repo)
    _git_cwd(["commit", "-m", "seed"], repo)
    _git_cwd(["remote", "add", "origin", str(remote)], repo)
    _git_cwd(["push", "-u", "origin", "main"], repo)

    for index in (1, 2):
        (repo / f"committed-{index}.md").write_text(f"committed {index}\n", encoding="utf-8")
        _git_cwd(["add", f"committed-{index}.md"], repo)
        _git_cwd(["commit", "-m", f"unpushed {index}"], repo)

    (repo / "readme.md").write_text("base\nwork in progress\n", encoding="utf-8")
    (repo / "untracked.md").write_text("new\n", encoding="utf-8")
    return repo


def _git_status_over_the_wire(runtime, workspace_id: str) -> dict:
    from fastapi.testclient import TestClient

    from agent_box.server.transport.http import create_app

    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        return client.post("/wire/v1/workspaces.gitStatus", headers={
            "Authorization": f"Bearer {runtime.token}"}, json={
            "jsonrpc": "2.0", "id": "g", "method": "workspaces.gitStatus",
            "params": {"requestId": "083-wsl-git-status", "workspaceId": workspace_id},
        }).json()["result"]["git"]


def _wsl_workspace(runtime, repo_path: Path):
    """A workspace record that keeps its `wsl` placement and points at a real path."""
    workspace = runtime.repository.workspaces.create(
        key="083-wsl", request_digest="083-wsl", distribution=DISTRIBUTION,
        remote_user=getpass.getuser(), remote_path=str(repo_path),
        connection_id="connection-083")[1]
    with runtime.database.transaction() as conn:
        row = conn.execute(
            "SELECT env_kind FROM server_workspaces WHERE id=?",
            (workspace["workspace_id"],),
        ).fetchone()
    # The default is what makes this the WSL leg at all; say so loudly if it changes.
    assert row[0] == "wsl", f"the leg silently stopped being WSL: env_kind={row[0]!r}"
    return workspace


def test_the_wsl_leg_reports_the_real_repository_state(tmp_path):
    _channel_or_skip()
    repo = _repository(tmp_path)
    runtime = build_runtime(tmp_path / "server", connector=_connector(tmp_path))
    runtime.start()
    try:
        workspace = _wsl_workspace(runtime, repo)
        answer = _git_status_over_the_wire(runtime, workspace["workspace_id"])
    finally:
        runtime.stop()

    assert answer["reason"] is None, answer
    assert answer["branch"] == "main"
    # one tracked modification + one untracked file, counted on the WSL side
    assert answer["changedFiles"] == 2
    # two commits ahead of origin/main, nothing behind - real upstream arithmetic
    assert answer["ahead"] == 2
    assert answer["behind"] == 0
    assert answer["additions"] is None and answer["deletions"] is None


def test_a_path_that_is_not_a_repository_answers_the_reason_not_a_number(tmp_path):
    """G1's required counter-example: no fabricated zeros for a plain directory."""
    _channel_or_skip()
    plain = tmp_path / "plain"
    plain.mkdir()
    runtime = build_runtime(tmp_path / "server", connector=_connector(tmp_path))
    runtime.start()
    try:
        workspace = _wsl_workspace(runtime, plain)
        answer = _git_status_over_the_wire(runtime, workspace["workspace_id"])
    finally:
        runtime.stop()

    assert answer["reason"] == "GIT_NOT_A_REPOSITORY"
    assert answer["branch"] is None
    assert answer["changedFiles"] is None, "a non-repository must not read as zero changes"
    assert answer["ahead"] is None and answer["behind"] is None
    assert answer["additions"] is None and answer["deletions"] is None


def test_no_host_path_leaks_into_the_wsl_answer(tmp_path):
    _channel_or_skip()
    repo = _repository(tmp_path)
    runtime = build_runtime(tmp_path / "server", connector=_connector(tmp_path))
    runtime.start()
    try:
        workspace = _wsl_workspace(runtime, repo)
        answer = _git_status_over_the_wire(runtime, workspace["workspace_id"])
    finally:
        runtime.stop()

    serialised = json.dumps(answer)
    assert str(repo) not in serialised
    assert "/home/" not in serialised and "/tmp/" not in serialised


def _executions_over_the_wire(runtime) -> list[dict]:
    from fastapi.testclient import TestClient

    from agent_box.server.transport.http import create_app

    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        answer = client.post("/wire/v1/executions.list", headers={
            "Authorization": f"Bearer {runtime.token}"}, json={
            "jsonrpc": "2.0", "id": "e", "method": "executions.list",
            "params": {"requestId": "083-wsl-executions"},
        }).json()
    if "error" in answer:
        raise AssertionError(f"executions.list errored: {answer['error']}")
    return answer["result"]["executions"]


def _running_wsl_turn(runtime, workspace) -> str:
    """One real turn row for the WSL workspace, in the state a running leg holds.

    The row is written the way 64's own tests write it: through the ledger, not
    through a dispatched execution. A WSL execution cannot be composed on this
    side (see the order's evidence note), so what is real here is the WSL
    composition and the WSL-shaped reading, not a live Worker process.
    """
    profile = runtime.repository.profiles.create(        key="083-p", request_digest="083-p", name="083-wsl-role",
        harness_type="codex", config_digest="sha256:" + "0" * 64,
        credential_id=None)[1]
    with runtime.database.transaction() as conn:
        conn.execute(
            "INSERT INTO server_sessions(id,workspace_id,profile_id,status,version,"
            "created_at,updated_at) VALUES (?,?,?,'active',1,'t','t')",
            ("session_083", workspace["workspace_id"], profile["profile_id"]),
        )
        conn.execute(
            "INSERT INTO server_turns(id,session_id,profile_id,profile_revision,"
            "native_generation,state,capture_state,cleanup_state,input_object_digest,"
            "created_at,updated_at) VALUES (?,?,?,1,0,'running','pending','pending','x','t','t')",
            ("turn_083", "session_083", profile["profile_id"]),
        )
    return "turn_083"


def test_an_in_flight_wsl_turn_appears_with_the_reported_pid_semantics(tmp_path):
    """G2: the inventory answers for a WSL placement, pid unreported out loud."""
    _channel_or_skip()
    repo = _repository(tmp_path)
    runtime = build_runtime(tmp_path / "server", connector=_connector(tmp_path))
    runtime.start()
    try:
        workspace = _wsl_workspace(runtime, repo)
        turn_id = _running_wsl_turn(runtime, workspace)
        rows = _executions_over_the_wire(runtime)
    finally:
        runtime.stop()

    assert [row["turnId"] for row in rows] == [turn_id]
    row = rows[0]
    assert row["placement"] == "wsl"
    assert row["state"] == "running"
    # The WSL Worker protocol reports no pid, and the card says so instead of guessing.
    assert row["pid"] is None and row["pidReason"] == "PID_NOT_REPORTED"
    assert row["adapterPid"] is None
    assert "/home/" not in json.dumps(row) and str(repo) not in json.dumps(row)


def test_an_empty_wsl_composition_answers_an_empty_list(tmp_path):
    """G2's required counter-example: nothing in flight is empty, never an error."""
    _channel_or_skip()
    repo = _repository(tmp_path)
    runtime = build_runtime(tmp_path / "server", connector=_connector(tmp_path))
    runtime.start()
    try:
        _wsl_workspace(runtime, repo)
        rows = _executions_over_the_wire(runtime)
    finally:
        runtime.stop()

    assert rows == []


def test_the_same_workspace_without_a_connector_is_refused_not_guessed(tmp_path):
    """The assertion above has teeth: with no connector composed, the leg says so.

    This is what makes "reason is None" in the passing case evidence rather than
    a tautology - the same record against the same workspace answers the typed
    unavailability instead of inventing a branch or a count.
    """
    _channel_or_skip()
    repo = _repository(tmp_path)
    runtime = build_runtime(tmp_path / "server")   # no connector composed
    runtime.start()
    try:
        workspace = _wsl_workspace(runtime, repo)
        answer = _git_status_over_the_wire(runtime, workspace["workspace_id"])
    finally:
        runtime.stop()

    assert answer["reason"] == "GIT_UNAVAILABLE"
    assert answer["branch"] is None and answer["changedFiles"] is None
