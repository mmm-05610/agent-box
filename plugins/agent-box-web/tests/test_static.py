from pathlib import Path

from agent_box_web.server.static import locate_web_static

PLUGIN_ROOT = Path(__file__).resolve().parents[1]
STATIC_ROOT = PLUGIN_ROOT / "src" / "agent_box_web" / "_static"
REQUIRED_STATIC = {
    "index.html",
    "favicon.svg",
    "icons.svg",
    "logo.png",
    "logos/claude.svg",
    "logos/hermes.png",
    "logos/openai.svg",
    "logos/opencode-logo-light.svg",
}


def test_web_static_locator_prefers_explicit_build(tmp_path, monkeypatch):
    explicit = tmp_path / "web"
    explicit.mkdir()
    (explicit / "index.html").write_text("<html></html>")
    monkeypatch.setenv("AGENT_BOX_WEB_STATIC", str(explicit))
    assert locate_web_static() == explicit.resolve()


def test_web_static_locator_finds_source_checkout_build(monkeypatch):
    monkeypatch.delenv("AGENT_BOX_WEB_STATIC", raising=False)
    located = locate_web_static()
    assert located is not None
    assert (located / "index.html").is_file()


def test_web_static_locator_returns_none_when_no_candidate_exists(tmp_path, monkeypatch):
    monkeypatch.setenv("AGENT_BOX_WEB_STATIC", str(tmp_path / "missing"))
    monkeypatch.setattr(Path, "is_file", lambda self: False)
    assert locate_web_static() is None


def test_package_static_tree_is_complete_and_vite_is_the_sync_owner():
    assert REQUIRED_STATIC.issubset(
        str(path.relative_to(STATIC_ROOT))
        for path in STATIC_ROOT.rglob("*")
        if path.is_file()
    )
    config = (PLUGIN_ROOT / "frontend" / "vite.config.ts").read_text(encoding="utf-8")
    assert "outDir: '../src/agent_box_web/_static'" in config
    assert "emptyOutDir: true" in config
    assert not (PLUGIN_ROOT / "frontend" / "dist").exists()
    assert not (PLUGIN_ROOT / "frontend" / "node_modules").exists()


def test_static_locator_does_not_fall_back_to_removed_root_gui():
    static_source = (PLUGIN_ROOT / "src" / "agent_box_web" / "server" / "static.py").read_text(encoding="utf-8")
    assert "gui-web" not in static_source
    assert "frontend" in static_source
