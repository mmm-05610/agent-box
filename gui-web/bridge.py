"""
PyWebView Bridge — Exposes agent-box functions to JavaScript.

This module creates a native window with the React frontend loaded,
and exposes Python functions as a JavaScript API via window.api.
"""

import json
import sys
from pathlib import Path

import webview

# Add agent-box to path so we can import its modules
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from agent_box import config, library, profile, sessions
from agent_box.providers import (
    apply_provider,
    delete_provider,
    get_provider,
    list_providers,
    upsert_provider,
)
from agent_box.claude_mds import (
    apply_claude_md,
    delete_claude_md,
    get_claude_md,
    list_claude_mds,
    upsert_claude_md,
)


class Api:
    """JavaScript-accessible API via window.api."""

    # ── Providers ───────────────────────────────────────────────────────

    def list_providers(self, agent_type: str) -> str:
        """Return providers for an agent type as JSON."""
        try:
            providers = list_providers(agent_type)
            return json.dumps({"ok": True, "data": providers})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_provider(self, agent_type: str, provider_id: str) -> str:
        """Return a single provider as JSON."""
        try:
            p = get_provider(agent_type, provider_id)
            return json.dumps({"ok": True, "data": p})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def save_provider(
        self, agent_type: str, provider_id: str, settings_json: str
    ) -> str:
        """Save a provider. Returns the saved provider as JSON."""
        try:
            p = upsert_provider(agent_type, provider_id, settings_json)
            return json.dumps({"ok": True, "data": p})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def delete_provider(self, agent_type: str, provider_id: str) -> str:
        """Delete a provider."""
        try:
            delete_provider(agent_type, provider_id)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── Claude.md ───────────────────────────────────────────────────────

    def list_claude_mds(self, agent_type: str) -> str:
        """Return Claude.md templates as JSON."""
        try:
            mds = list_claude_mds(agent_type)
            return json.dumps({"ok": True, "data": mds})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_claude_md(self, agent_type: str, md_id: str) -> str:
        """Return a single Claude.md as JSON."""
        try:
            m = get_claude_md(agent_type, md_id)
            return json.dumps({"ok": True, "data": m})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def save_claude_md(
        self,
        agent_type: str,
        md_id: str,
        content: str,
        name: str = "",
        description: str = "",
    ) -> str:
        """Save a Claude.md template."""
        try:
            m = upsert_claude_md(
                agent_type,
                md_id,
                content,
                name=name or None,
                description=description or None,
            )
            return json.dumps({"ok": True, "data": m})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def delete_claude_md(self, agent_type: str, md_id: str) -> str:
        """Delete a Claude.md template."""
        try:
            delete_claude_md(agent_type, md_id)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── Profiles ────────────────────────────────────────────────────────

    def list_profiles(self) -> str:
        """Return all profiles as JSON."""
        try:
            profiles = profile.list_profiles()
            return json.dumps({"ok": True, "data": profiles})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_profile(self, name: str) -> str:
        """Return a single profile as JSON."""
        try:
            p = profile.show(name)
            return json.dumps({"ok": True, "data": p})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def create_profile(
        self,
        name: str,
        agent_type: str,
        display_name: str = "",
        description: str = "",
        preset: str = "",
    ) -> str:
        """Create a new profile."""
        try:
            p = profile.create(
                name,
                agent_type,
                display_name=display_name or None,
                description=description or None,
                preset=preset or None,
            )
            return json.dumps({"ok": True, "data": p})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def delete_profile(self, name: str) -> str:
        """Delete a profile."""
        try:
            profile.delete(name)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── Sessions ────────────────────────────────────────────────────────

    def list_sessions(self) -> str:
        """Return all sessions as JSON."""
        try:
            s = sessions.fetch_sessions()
            return json.dumps({"ok": True, "data": s})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def cleanup_sessions(self) -> str:
        """Clean up stale sessions."""
        try:
            count = sessions.cleanup_stale_sessions()
            return json.dumps({"ok": True, "data": count})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── Library ─────────────────────────────────────────────────────────

    def get_agent_types(self) -> str:
        """Return supported agent types."""
        try:
            types = library.get_agent_types()
            return json.dumps({"ok": True, "data": types})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def list_presets(self, agent_type: str) -> str:
        """Return presets for an agent type."""
        try:
            presets = library.list_presets(agent_type)
            return json.dumps({"ok": True, "data": presets})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── Apply ───────────────────────────────────────────────────────────

    def apply_provider(self, profile_name: str, provider_id: str) -> str:
        """Apply a provider to a profile."""
        try:
            apply_provider(profile_name, provider_id)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def apply_claude_md(self, profile_name: str, md_id: str) -> str:
        """Apply a Claude.md to a profile."""
        try:
            apply_claude_md(profile_name, md_id)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})


def main():
    """Launch the GUI."""
    api = Api()

    # Determine frontend URL or file
    frontend_dir = Path(__file__).parent / "dist"
    if frontend_dir.exists():
        # Production: load built files
        url = str(frontend_dir / "index.html")
    else:
        # Development: load from Vite dev server
        url = "http://localhost:5173"

    window = webview.create_window(
        title="Agent Box",
        url=url,
        js_api=api,
        width=1280,
        height=800,
        min_size=(960, 600),
    )

    webview.start(debug="--debug" in sys.argv)


if __name__ == "__main__":
    main()
