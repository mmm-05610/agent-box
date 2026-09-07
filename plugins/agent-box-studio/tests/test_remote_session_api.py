"""C2.2 remote Session REST facade: the GUI's HTTP surface for WSL projects.

The GUI has saved a WSL Project and must create a remote Session over REST.
These tests drive the route through the EXACT production Rust wire (the
``RustShapedBridge`` from the c22 vertical) and the SAME production
``WslLiveWorkspaceProvider`` class.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from agent_box.extensions.bootstrap import build_extension_environment
from agent_box_studio.config import StudioConfig
from agent_box_studio.host_bridge import (
    HostBridgeBootstrap,
    HostBridgeClient,
    HostBridgeHostAuthority,
)
from agent_box_studio.server.app import create_app
from agent_box_workspace_wsl import WslLiveWorkspaceProvider

from conftest import TEST_TOKEN, production_entry_points
from test_c22_host_bridge_vertical import RECEIPT, RustShapedBridge

# The workspace provider is constructed with the bridge authority and a
# controlled registry path; its production entry point is excluded for the
# duration so the SAME production class can be registered deterministically.
_TEST_ENTRY_POINTS = production_entry_points(exclude=frozenset({"workspace-wsl"}))


def _build_app(bridge: RustShapedBridge, registry_path, *, host_operations=None):
    """Build the app over the bridge authority; returns (app, authority).

    ``host_operations`` is the value handed to ``create_app`` verbatim —
    the explicit seam the production CLI wires (readiness tests exercise
    the authority, a bare client, and its absence).
    """
    bootstrap = HostBridgeBootstrap(bridge.endpoint, "bridge-capability", "V1")
    authority = HostBridgeHostAuthority(HostBridgeClient(bootstrap))
    environment = build_extension_environment(
        host_operations=authority, entry_points=_TEST_ENTRY_POINTS
    )
    workspace = WslLiveWorkspaceProvider(
        host_operations=authority,
        registry_path=registry_path,
    )
    environment.registry.register_resource_provider(workspace)
    app = create_app(
        StudioConfig(worker_mode="inline"),
        environment=environment,
        workspace=workspace,
        token=TEST_TOKEN,
        host_operations=host_operations,
    )
    return app, authority


def _client_for(app) -> TestClient:
    client = TestClient(app)
    client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
    return client


def _make_client(bridge: RustShapedBridge, registry_path) -> TestClient:
    app, _authority = _build_app(bridge, registry_path)
    return _client_for(app)


REMOTE_BODY = {
    "idempotency_key": "rest-remote-session-1",
    "title": "remote REST session",
    "connection_id": RECEIPT["connection_id"],
    "connection_revision": RECEIPT["revision"],
    "project_identity": "project-wsl-1",
    "project_id": "project-wsl-1",
    "remote_path": RECEIPT["project_root"],
}


def test_post_sessions_creates_a_remote_session_over_the_bridge_wire(
    studio_home, tmp_path
):
    bridge = RustShapedBridge()
    bridge.start()
    try:
        client = _make_client(bridge, tmp_path / "wsl-projects.json")
        with client:
            response = client.post("/api/v1/sessions", json=REMOTE_BODY)
    finally:
        bridge.close()

    assert response.status_code == 201, response.text
    session = response.json()["session"]
    assert session["workspace_mode"] == "live"
    assert session["workspace_provider"] == "wsl-live-workspace"
    assert session["connection_id"] == RECEIPT["connection_id"]
    assert session["connection_revision"] == RECEIPT["revision"]
    assert session["project_id"] == "project-wsl-1"
    resolves = [
        request
        for request in bridge.requests
        if (request.get("operation") or {}).get("operation") == "connectionResolve"
    ]
    assert resolves, "the REST route never reached the private bridge"


def test_session_listing_and_detail_report_the_remote_project_id(
    studio_home, tmp_path
):
    bridge = RustShapedBridge()
    bridge.start()
    try:
        client = _make_client(bridge, tmp_path / "wsl-projects.json")
        with client:
            created = client.post("/api/v1/sessions", json=REMOTE_BODY)
            assert created.status_code == 201, created.text
            session_id = created.json()["session"]["session_id"]
            listing = client.get("/api/v1/sessions").json()["sessions"]
            detail = client.get(f"/api/v1/sessions/{session_id}").json()["session"]
    finally:
        bridge.close()

    rows = [row for row in listing if row["session_id"] == session_id]
    assert rows, "the remote session is missing from the listing"
    assert rows[0]["project_id"] == "project-wsl-1"
    assert detail["project_id"] == "project-wsl-1"
    assert detail["workspace_provider"] == "wsl-live-workspace"


def test_get_remote_projects_lists_the_saved_wsl_projects(studio_home, tmp_path):
    bridge = RustShapedBridge()
    bridge.start()
    try:
        client = _make_client(bridge, tmp_path / "wsl-projects.json")
        with client:
            created = client.post("/api/v1/sessions", json=REMOTE_BODY)
            assert created.status_code == 201, created.text
            response = client.get("/api/v1/remote-projects")
    finally:
        bridge.close()

    assert response.status_code == 200, response.text
    assert response.json() == {
        "remote_projects": [
            {
                "project_id": "project-wsl-1",
                "connection_id": RECEIPT["connection_id"],
                "connection_revision": RECEIPT["revision"],
                "remote_path": RECEIPT["project_root"],
            }
        ]
    }


def test_readiness_reports_the_bridge_authority_as_the_remote_component(
    studio_home, tmp_path
):
    bridge = RustShapedBridge()
    bridge.start()
    try:
        _, authority = _build_app(bridge, tmp_path / "wsl-projects.json")
        app, _same_authority = _build_app(
            bridge, tmp_path / "wsl-projects.json", host_operations=authority
        )
        with _client_for(app) as client:
            body = client.get("/api/v1/readiness").json()
    finally:
        bridge.close()

    assert body["remote"]["host_bridge"] == "available"
    # Pure type facts only: no capability values, fingerprints, or host
    # paths may cross the readiness boundary.
    text = str(body)
    assert "bridge-capability" not in text
    assert "worker_bootstrap" not in text
    assert RECEIPT["fingerprint"] not in text
    assert RECEIPT["project_root"] not in text


def test_readiness_reports_a_bare_bridge_client_as_unavailable(studio_home, tmp_path):
    bridge = RustShapedBridge()
    bridge.start()
    try:
        bootstrap = HostBridgeBootstrap(bridge.endpoint, "bridge-capability", "V1")
        bare = HostBridgeClient(bootstrap)
        app, _authority = _build_app(
            bridge, tmp_path / "wsl-projects.json", host_operations=bare
        )
        with _client_for(app) as client:
            body = client.get("/api/v1/readiness").json()
    finally:
        bridge.close()

    assert body["remote"]["host_bridge"] == "unavailable"


def test_readiness_reports_the_absence_of_a_host_bridge(client):
    body = client.get("/api/v1/readiness").json()
    assert body["remote"]["host_bridge"] == "unavailable"


def test_local_project_path_session_creation_is_unchanged(client, project_dir):
    response = client.post(
        "/api/v1/sessions",
        json={
            "idempotency_key": "rest-local-session-1",
            "title": "local REST session",
            "project_path": str(project_dir),
        },
    )
    assert response.status_code == 201, response.text
    session = response.json()["session"]
    assert session["project_id"]
    assert session["workspace_mode"] == "live"
    # A local (non-WSL) workspace has no remote projects to enumerate.
    assert client.get("/api/v1/remote-projects").json() == {"remote_projects": []}


def test_local_and_remote_references_are_mutually_exclusive(client, project_dir):
    response = client.post(
        "/api/v1/sessions",
        json={
            "idempotency_key": "rest-mixed-session-1",
            "title": "mixed reference session",
            "project_path": str(project_dir),
            "connection_id": RECEIPT["connection_id"],
            "connection_revision": RECEIPT["revision"],
            "project_identity": "project-wsl-1",
            "remote_path": RECEIPT["project_root"],
        },
    )
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"], "the typed error envelope carries a stable code"
