"""Order 66 stage A: the whole-db session store - declaration and binding.

Two layers are covered here:

* the bwrap compiler's overlay rule (unit): every shared name is bound from
  the family library over the profile home's own copy, *after* the state home
  bind, and a target outside the declared state directory is refused;
* the real chain (local placement, bwrap, the release Worker binary is not
  needed): a family that declares `sessionStore.kind = "whole-db"` has the
  named entries written into the per-harness library
  (`<home root>/_sessions/<family>/...`), while a name the declaration did
  not share stays in the profile home.
"""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harnesses"
PEER_SOURCE = "tests/harness_remote/home_probe_acp_peer.mjs"
PEER_BYTES = REPO / "tests" / "server" / "fixtures" / "home_probe_acp_peer.mjs"

SHARED = [
    {"name": "kilo.db", "kind": "file"},
    {"name": "storage/session_diff", "kind": "directory"},
    {"name": "kilo", "kind": "directory"},
]
STATE_TARGET = "/runtime/home/.local/share/kilo"

DEPLOYMENT = {
    "schemaVersion": 1,
    "harnesses": [
        {
            "id": "kilo",
            "capabilityClaims": {"stream": True},
            "adapter": {"command": "/usr/bin/node", "args": [], "source": PEER_SOURCE,
                        "environment": {
                            "AGENTBOX_FIXTURE_STATE_DIR": f"{STATE_TARGET}/kilo",
                        }},
            "stateProjection": {"target": STATE_TARGET},
            "sessionStore": {"kind": "whole-db", "shared": SHARED},
            "timeoutMs": 60_000,
        },
    ],
}


def test_the_compiler_layers_shared_names_over_the_state_home():
    """The overlay bind comes after the state home and stays inside it."""
    from agent_box_sandbox_bwrap.provider import compile_remote_sidecar_bwrap_argv
    from agent_box.extensions.runtime_composition import ProjectionRejected

    argv = compile_remote_sidecar_bwrap_argv(
        workspace="/host/workspace", runtime_view="/host/view",
        environment={"HOME": "/runtime/home"},
        writable_projection_mounts=[("/host/role/.local/share/kilo", STATE_TARGET)],
        state_overlay_mounts=[
            ("/host/library/kilo.db", f"{STATE_TARGET}/kilo.db"),
            ("/host/library/storage/session_diff", f"{STATE_TARGET}/storage/session_diff"),
        ],
    )
    pairs = [(argv[index + 1], argv[index + 2])
             for index, value in enumerate(argv) if value in {"--bind", "--ro-bind"}]
    home = ("/host/role/.local/share/kilo", STATE_TARGET)
    overlay = ("/host/library/kilo.db", f"{STATE_TARGET}/kilo.db")
    assert home in pairs and overlay in pairs
    assert pairs.index(home) < pairs.index(overlay), "the overlay must win"

    with pytest.raises(ProjectionRejected):
        compile_remote_sidecar_bwrap_argv(
            workspace="/host/workspace", runtime_view="/host/view",
            environment={},
            writable_projection_mounts=[("/host/role/.local/share/kilo", STATE_TARGET)],
            state_overlay_mounts=[("/host/library/escape", "/runtime/home/.config/kilo/x")],
        )


def _wire_post(client, token, method, params):
    response = client.post(f"/wire/v1/{method}", headers={
        "Authorization": f"Bearer {token}",
    }, json={"jsonrpc": "2.0", "id": method, "method": method, "params": params})
    body = response.json()
    if "error" in body:
        raise AssertionError(f"{method}: {json.dumps(body['error'])}")
    return body["result"]


def _wait_turn(runtime, session_id, timeout=90.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if session["turns"] and session["turns"][0]["state"] in {"completed", "failed"}:
            return session
        time.sleep(0.05)
    raise AssertionError("the turn never reached a terminal state")


@pytest.mark.skipif(shutil.which("bwrap") is None, reason="bwrap is required")
@pytest.mark.parametrize(
    "state_dir,placement",
    [(f"{STATE_TARGET}/kilo", "library"), (f"{STATE_TARGET}/log", "profile")],
)
def test_whole_db_shared_names_land_in_the_library(tmp_path, state_dir, placement):
    from fastapi.testclient import TestClient

    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
    from agent_box.server.transport.http import create_app

    import agent_box.server.bootstrap.runtime as runtime_module

    document_value = json.loads(json.dumps(DEPLOYMENT))
    document_value["harnesses"][0]["adapter"]["environment"] = {
        "AGENTBOX_FIXTURE_STATE_DIR": state_dir,
    }

    original_file = runtime_module._sidecar_deployment_file

    def deployment_file(root, relative):
        if relative == PEER_SOURCE:
            return PEER_BYTES.read_bytes()
        return original_file(root, relative)

    runtime_module._sidecar_deployment_file = deployment_file
    try:
        data_root = tmp_path / "server"
        workspace = tmp_path / "project"
        workspace.mkdir()
        document = tmp_path / "deployment.json"
        document.write_text(json.dumps(document_value), encoding="utf-8")
        runtime = build_runtime_from_sidecar_deployment(
            data_root, document, plugin_root=PLUGIN)
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            token = runtime.token
            opened = _wire_post(client, token, "workspaces.open", {
                "requestId": "store-open", "path": str(workspace),
                "environment": {"kind": "local", "host": None, "user": None},
            })
            profile = client.post("/api/v1/profiles", headers={
                "Authorization": f"Bearer {token}", "Idempotency-Key": "store-profile",
            }, json={"name": "shared-store", "harness_type": "kilo",
                     "configuration": {}, "credential_id": None})
            assert profile.status_code == 201, profile.text
            profile_id = profile.json()["profile_id"]

            def send(request_id, text):
                return _wire_post(client, token, "sessions.createAndSend", {
                    "requestId": request_id, "workspaceId": opened["workspace"]["id"],
                    "profileId": profile_id, "overrides": [],
                    "message": {"text": text, "attachments": []},
                })

            # Turn 1: the fixture writes into a *shared* name (<state>/kilo).
            first = send("store-shared", "write into the shared subtree")
            session = _wait_turn(runtime, first["session"]["id"])
            assert session["turns"][0]["state"] == "completed", session["turns"][0]

            library = data_root / "profiles" / "_sessions" / "kilo"
            role_dirs = [
                item for item in (data_root / "profiles").iterdir()
                if item.is_dir() and item.name != "_sessions"
            ]
            assert len(role_dirs) == 1, role_dirs
            role = role_dirs[0]
            relative = state_dir[len(STATE_TARGET) + 1:]
            shared_file = library / relative / "native-state.json"
            profile_file = role / ".local/share/kilo" / relative / "native-state.json"
            if placement == "library":
                # A shared name: the write lands in the family library, and the
                # profile home keeps at most the empty mount point bwrap made.
                assert shared_file.is_file(), sorted(library.rglob("*"))
                assert not profile_file.exists()
            else:
                # A name the declaration did not share (log/): the write stays
                # in the profile home and never reaches the library.
                assert profile_file.is_file(), sorted(role.rglob("*"))
                assert not shared_file.exists(), sorted(library.rglob("*"))
    finally:
        runtime_module._sidecar_deployment_file = original_file
