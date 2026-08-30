from pathlib import Path


PLUGIN_ROOT = Path(__file__).resolve().parents[1]


def test_web_package_declares_recursive_static_package_data():
    metadata = (PLUGIN_ROOT / "pyproject.toml").read_text(encoding="utf-8")
    assert 'agent_box_web = ["_static/**"]' in metadata
    assert "agent_box.plugins" not in metadata


def test_root_package_does_not_declare_web_static_data():
    root_metadata = (PLUGIN_ROOT.parents[1] / "pyproject.toml").read_text(encoding="utf-8")
    assert "setuptools.data-files" not in root_metadata
    assert "gui-web/dist" not in root_metadata
