"""Shared Studio test fixtures: isolated homes and a bootstrapped app."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from agent_box.extensions.bootstrap import build_extension_environment
from agent_box.work_core.db import _reset_connection_for_tests

from agent_box_studio.config import StudioConfig
from agent_box_studio.server.app import create_app
from agent_box_studio.testing import FakeTurnExecutionProvider

TEST_TOKEN = "studio-test-token-0123456789abcdef"


@pytest.fixture
def studio_home(tmp_path, monkeypatch):
    home = tmp_path / "studio-home"
    home.mkdir()
    monkeypatch.setenv("AGENT_BOX_HOME", str(home))
    _reset_connection_for_tests()
    yield home
    _reset_connection_for_tests()


def _make_app(studio_home, *, with_fake: bool = True, **create_kwargs):
    create_kwargs.setdefault("token", TEST_TOKEN)
    config = create_kwargs.pop("config", None) or StudioConfig(
        worker_mode="inline"
    )
    environment = build_extension_environment()
    if with_fake:
        environment.registry.register_execution_provider(FakeTurnExecutionProvider())
    application = create_app(config, environment=environment, **create_kwargs)
    return application


@pytest.fixture
def app(studio_home):
    return _make_app(studio_home, with_fake=True)


@pytest.fixture
def app_without_fake(studio_home):
    return _make_app(studio_home, with_fake=False)


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        yield test_client


@pytest.fixture
def client_without_fake(app_without_fake):
    with TestClient(app_without_fake) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        yield test_client


@pytest.fixture
def project_dir(tmp_path):
    root = tmp_path / "user-project"
    root.mkdir()
    (root / "README.md").write_text("demo\n")
    return root


def create_session(client, project_dir, key: str = "sess-key-1") -> dict:
    response = client.post(
        "/api/v1/sessions",
        json={
            "idempotency_key": key,
            "title": "Probe session",
            "project_path": str(project_dir),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["session"]
