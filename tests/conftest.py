"""Shared pytest fixtures.

The ``tmp_agent_box_home`` fixture isolates all profile ops to a
``tmp_path`` subdir via the ``AGENT_BOX_HOME`` env var (honored live by
``config.agent_box_home()``).  Tests must NEVER touch the real
``~/.agent-box`` — monkeypatching the env var is the only way to
guarantee that.

It also drops the cached ``agent-box.db`` connection (and the
``sessions._migrated`` sentinel) so a previous test's
``AGENT_BOX_HOME`` doesn't leak into this one.

The ``acs_stub`` fixture lets tests inject canned ACS data without
needing a real ACS database. Tests register servers/skills/providers/
prompts on the stub and ACS calls return the stub data.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import pytest

from agent_box.core.db import _reset_connection_for_tests
from agent_box.resources import sessions


@pytest.fixture
def tmp_agent_box_home(tmp_path, monkeypatch):
    """Point ``AGENT_BOX_HOME`` at a fresh tmp dir for this test."""
    home = tmp_path / "ab-home"
    home.mkdir()
    monkeypatch.setenv("AGENT_BOX_HOME", str(home))
    # Drop the cached db connection (shared by db.py / sessions.py)
    # and the sessions-migration sentinel.
    _reset_connection_for_tests()
    yield home


class AcsStub:
    """In-memory replacement for the ACS database.

    Tests register MCP servers, skills, providers, and prompts; the
    stub then answers ``get_*`` / ``list_*`` queries the same way the
    real ACS adapter does. agent-box only reads from ACS, so this
    is sufficient for apply-side tests.
    """

    def __init__(self, monkeypatch) -> None:
        self._mcp: Dict[str, Dict[str, Any]] = {}
        self._skills: Dict[str, Dict[str, Any]] = {}
        self._providers: Dict[tuple[str, str], Dict[str, Any]] = {}
        self._prompts: Dict[tuple[str, str], Dict[str, Any]] = {}

        # Apply paths import ACS via acs (the package-level
        # shim). Patch the symbols it actually looks at.
        from agent_box.adapters import acs
        monkeypatch.setattr(acs, "get_mcp_server",
                            self._get_mcp_server)
        monkeypatch.setattr(acs, "list_mcp_servers",
                            self._list_mcp_servers)
        monkeypatch.setattr(acs, "get_provider",
                            self._get_provider)
        monkeypatch.setattr(acs, "list_providers",
                            self._list_providers)
        monkeypatch.setattr(acs, "list_skills",
                            self._list_skills)
        monkeypatch.setattr(acs, "list_prompts",
                            self._list_prompts)

    # ── MCP ─────────────────────────────────────────────────────────
    def add_mcp(self, server_id: str, server_config: Dict[str, Any],
                name: str = "", description: str = "",
                enabled_agents: List[str] | None = None) -> None:
        self._mcp[server_id] = {
            "id": server_id,
            "name": name or server_id,
            "description": description,
            "homepage": "",
            "docs": "",
            "tags": [],
            "server_config": server_config,
            "server_config_parsed": server_config,
            "agent_types": list(enabled_agents or []),
        }

    def _get_mcp_server(self, server_id: str) -> Dict[str, Any] | None:
        return self._mcp.get(server_id)

    def _list_mcp_servers(self, agent_type: str) -> List[Dict[str, Any]]:
        return [
            {k: v for k, v in srv.items() if k != "agent_types"}
            for srv in self._mcp.values()
            if agent_type in srv.get("agent_types", [])
        ]

    # ── Skills ──────────────────────────────────────────────────────
    def add_skill(self, skill_id: str, directory: str = "",
                  name: str = "", description: str = "") -> None:
        self._skills[skill_id] = {
            "id": skill_id,
            "name": name or skill_id,
            "description": description,
            "directory": directory,
            "source_available": bool(directory and Path(directory).is_dir()),
            "source_path": directory if directory and Path(directory).is_dir() else None,
            "repo_owner": "",
            "repo_name": "",
            "repo_branch": "main",
            "readme_url": "",
        }

    def _list_skills(self, agent_type: str) -> List[Dict[str, Any]]:
        # ACS list_skills returned entries gated by enabled_<agent_type>.
        # The stub doesn't gate — caller tests pass an agent_type that
        # matches and expect all entries back.
        return list(self._skills.values())

    # ── Providers ───────────────────────────────────────────────────
    def add_provider(self, agent_type: str, provider_id: str,
                     settings: Dict[str, Any] | None = None,
                     name: str = "", website_url: str = "",
                     category: str = "", notes: str = "",
                     icon: str | None = None, icon_color: str | None = None
                     ) -> None:
        self._providers[(agent_type, provider_id)] = {
            "id": provider_id,
            "app_type": agent_type,
            "name": name or provider_id,
            "settings": settings or {},
            "website_url": website_url,
            "category": category,
            "notes": notes,
            "icon": icon,
            "icon_color": icon_color,
        }

    def _get_provider(self, agent_type: str, provider_id: str
                      ) -> Dict[str, Any] | None:
        return self._providers.get((agent_type, provider_id))

    def _list_providers(self, agent_type: str) -> List[Dict[str, Any]]:
        return [
            p for (at, _), p in self._providers.items() if at == agent_type
        ]

    # ── Prompts ─────────────────────────────────────────────────────
    def add_prompt(self, agent_type: str, prompt_id: str,
                   content: str = "", name: str = "",
                   description: str = "") -> None:
        self._prompts[(agent_type, prompt_id)] = {
            "id": prompt_id,
            "name": name or prompt_id,
            "content": content,
            "description": description,
        }

    def _list_prompts(self, agent_type: str) -> List[Dict[str, Any]]:
        return [
            p for (at, _), p in self._prompts.items() if at == agent_type
        ]


@pytest.fixture
def acs_stub(monkeypatch) -> AcsStub:
    """Provide an in-memory ACS for tests that exercise apply paths."""
    return AcsStub(monkeypatch)
