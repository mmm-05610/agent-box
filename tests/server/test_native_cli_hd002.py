"""Actual loopback Server CLI with a bounded fake ACP peer, never a real Agent."""

import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import Request, urlopen
import pytest
from agent_box.storage import ObjectStore


REPO = Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harness"
FAKE = Path(__file__).with_name("fake_native_acp_peer_hd002.mjs")
HELLO = {"clientVersions": ["wire/1"], "clientPresentationSupports": []}


def _port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _call(port, token, method, params):
    payload = json.dumps({"jsonrpc": "2.0", "id": method, "method": method, "params": params}).encode()
    request = Request(
        f"http://127.0.0.1:{port}/wire/v1/{method}", data=payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urlopen(request, timeout=5) as response:
        return json.load(response)


def _session(port, token, session_id):
    request = Request(
        f"http://127.0.0.1:{port}/api/v1/sessions/{session_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urlopen(request, timeout=5) as response:
        return json.load(response)


def _settled(port, token, session_id, turn_count):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        row = _session(port, token, session_id)
        if len(row["turns"]) >= turn_count and row["turns"][-1]["state"] in {
            "completed", "failed", "cancelled", "unknown",
        }:
            return row
        time.sleep(0.05)
    raise AssertionError("fake CLI turn did not settle")


def _native_identity(port, token):
    hello = _call(port, token, "server.hello", HELLO)["result"]
    identity = hello["nativeExecution"]
    listed = _call(port, token, "profiles.list", {"includeArchived": False})["result"]["items"]
    matches = [row for row in listed if row["id"] == identity["profileId"]]
    assert len(matches) == 1, listed
    assert matches[0]["harness"] == identity["harness"]
    assert matches[0]["archivedAt"] is None
    assert matches[0]["sendability"]["state"] == "ready", matches[0]
    return identity


@pytest.mark.parametrize("advertise_resume", [True, False])
def test_native_cli_project_cwd_first_send_and_followup(tmp_path, advertise_resume):
    data = tmp_path / "data"
    home = tmp_path / "empty-home"
    home.mkdir()
    project_a = tmp_path / "project-a"
    project_b = tmp_path / "project-b"
    project_a.mkdir()
    project_b.mkdir()
    node = shutil.which("node")
    assert node and FAKE.is_file()
    port = _port()
    # This child sees no parent credentials or native Agent configuration.
    env = {
        "PATH": "/usr/bin:/bin", "HOME": str(home), "TMPDIR": str(tmp_path),
        "PYTHONPATH": str(REPO / "src"), "PYTHONUNBUFFERED": "1",
        "HD002_FAKE_SESSIONS": str(tmp_path / "fake-sessions.json"),
        "HD002_FAKE_NO_RESUME": "0" if advertise_resume else "1",
    }
    command = [
        sys.executable, "-m", "agent_box.server", "--data-root", str(data),
        "--port", str(port), "--execution-mode", "native",
        "--native-harness", "pi", "--plugin-root", str(PLUGIN),
        "--native-adapter-command", node, "--native-adapter-arg", str(FAKE),
        "--native-continuation",
    ]
    log_path = tmp_path / "server.log"
    with log_path.open("w") as log:
        server = subprocess.Popen(command, env=env, cwd=project_a,
                                  stdin=subprocess.DEVNULL, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                if server.poll() is not None:
                    raise AssertionError(f"native Server CLI exited {server.returncode}")
                token_path = data / "secrets" / "http-token"
                if token_path.is_file():
                    token = token_path.read_text().strip()
                    try:
                        hello = _call(port, token, "server.hello", HELLO)
                        if "result" in hello:
                            break
                    except (URLError, OSError):
                        pass
                time.sleep(0.05)
            else:
                raise AssertionError("native Server CLI did not become ready")
            identity = _native_identity(port, token)
            assert identity["mode"] == "native" and identity["harness"] == "pi"
            for label, project in (("a", project_a), ("b", project_b)):
                opened = _call(port, token, "workspaces.open", {
                    "requestId": f"open-project-{label}",
                    "environment": {"kind": "local", "host": None, "user": None},
                    "path": str(project),
                })
                workspace_id = opened["result"]["workspace"]["id"]
                sent = _call(port, token, "sessions.createAndSend", {
                    "requestId": f"first-project-{label}", "workspaceId": workspace_id,
                    "profileId": identity["profileId"],
                    "message": {"text": f"first-{label}", "attachments": []},
                    "overrides": [],
                })
                assert "result" in sent, (label, sent)
                assert sent["result"]["outcome"] == "accepted", sent
                assert sent["result"]["session"]["displayName"] == f"first-{label}"
                session_id = sent["result"]["session"]["id"]
                row = _settled(port, token, session_id, 1)
                assert row["turns"][-1]["state"] == "completed", row["turns"][-1]
                assert f"cwd={project}" in json.dumps(row), row
                if label == "a":
                    first_native_id = row["checkpoint"]["native_id"]
                    manifest = json.loads(ObjectStore(data).read(row["checkpoint"]["object_digest"]))
                    assert manifest["resumable"] is advertise_resume, manifest
                    followed = _call(port, token, "sessions.send", {
                        "requestId": "follow-project-a", "sessionId": session_id,
                        "message": {"text": "follow-a", "attachments": []},
                        "overrides": [],
                    })
                    assert followed["result"]["outcome"] == "accepted", followed
                    row = _settled(port, token, session_id, 2)
                    assert row["turns"][-1]["state"] == "completed", row["turns"][-1]
                    second_manifest = json.loads(ObjectStore(data).read(row["checkpoint"]["object_digest"]))
                    assert second_manifest["resumable"] is advertise_resume
                    assert f"cwd={project_a} input=follow-a" in json.dumps(row), row
                    assert "old-answer-replay" not in json.dumps(row), row
                    # A live Server session keeps one ACP channel regardless
                    # of whether durable session/load was advertised.
                    assert row["checkpoint"]["native_id"] == first_native_id
                    assert len(json.loads((tmp_path / "fake-sessions.json").read_text())) == 1
                    permission_send = _call(port, token, "sessions.send", {
                        "requestId": "permission-project-a", "sessionId": session_id,
                        "message": {"text": "needs-permission", "attachments": []},
                        "overrides": [],
                    })
                    assert permission_send["result"]["outcome"] == "accepted", permission_send
                    deadline = time.monotonic() + 10
                    approval = None
                    while time.monotonic() < deadline:
                        history = _call(port, token, "history.snapshot", {"sessionId": session_id})
                        matches = [frame["event"]["approval"] for frame in history["result"]["frames"]
                                   if frame["event"]["kind"] == "approval.requested"]
                        if matches:
                            approval = matches[-1]
                            break
                        time.sleep(0.05)
                    assert approval is not None, "fake peer permission did not reach Server"
                    decision = _call(port, token, "approvals.decide", {
                        "requestId": "allow-fake-tool", "approvalId": approval["approvalId"],
                        "decision": "allow", "scope": {"kind": "once"},
                        "expectedVersion": approval["version"],
                    })
                    assert decision["result"]["outcome"] == "recorded", decision
                    row = _settled(port, token, session_id, 3)
                    assert row["turns"][-1]["state"] == "completed", row["turns"][-1]
                    waiting = _call(port, token, "sessions.send", {
                        "requestId": "cancel-project-a", "sessionId": session_id,
                        "message": {"text": "wait-for-cancel", "attachments": []},
                        "overrides": [],
                    })
                    assert waiting["result"]["outcome"] == "accepted", waiting
                    stopped = _call(port, token, "runs.stop", {
                        "requestId": "stop-fake-turn", "sessionId": session_id,
                        "executionId": waiting["result"]["executionId"],
                    })
                    assert stopped["result"]["outcome"] in {"stop_requested", "already_finished"}, stopped
                    row = _settled(port, token, session_id, 4)
                    assert row["turns"][-1]["state"] == "cancelled", row["turns"][-1]
                    tooled = _call(port, token, "sessions.send", {
                        "requestId": "tool-project-a", "sessionId": session_id,
                        "message": {"text": "simulate-tool", "attachments": []},
                        "overrides": [],
                    })
                    assert tooled["result"]["outcome"] == "accepted", tooled
                    row = _settled(port, token, session_id, 5)
                    assert row["turns"][-1]["state"] == "completed", row["turns"][-1]
                    history = _call(port, token, "history.snapshot", {"sessionId": session_id})
                    tools = [frame["event"] for frame in history["result"]["frames"]
                             if frame["event"]["kind"] == "tool.update"]
                    assert any(item.get("resultExcerpt") == "file contents from native tool"
                               for item in tools), tools
                    agent_cancel = _call(port, token, "sessions.send", {
                        "requestId": "agent-cancel-project-a", "sessionId": session_id,
                        "message": {"text": "simulate-agent-cancel", "attachments": []},
                        "overrides": [],
                    })
                    assert agent_cancel["result"]["outcome"] == "accepted", agent_cancel
                    row = _settled(port, token, session_id, 6)
                    assert row["turns"][-1]["state"] == "cancelled", row["turns"][-1]
        finally:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
    # The internal profile is persistent in this data-root; a restart must
    # expose the same executable identity through authenticated real wire.
    with log_path.open("a") as log:
        server = subprocess.Popen(command, env=env, cwd=project_b,
                                  stdin=subprocess.DEVNULL, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                if server.poll() is not None:
                    raise AssertionError(f"restarted native Server exited {server.returncode}")
                try:
                    restarted = _native_identity(port, token)
                    break
                except (URLError, OSError):
                    time.sleep(0.05)
            else:
                raise AssertionError("restarted native Server did not become ready")
            assert restarted == identity
            errored = _call(port, token, "sessions.createAndSend", {
                "requestId": "native-error-project-b", "workspaceId": workspace_id,
                "profileId": identity["profileId"],
                "message": {"text": "simulate-native-error", "attachments": []},
                "overrides": [],
            })
            assert errored["result"]["outcome"] == "accepted", errored
            row = _settled(port, token, errored["result"]["session"]["id"], 1)
            assert row["turns"][-1]["state"] == "failed", row["turns"][-1]
            assert row["turns"][-1]["error_code"] == "HARNESS_RUN_FAILED"
        finally:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
