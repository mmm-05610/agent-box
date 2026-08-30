from pathlib import Path

from agent_box.server.static import locate_web_static


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
