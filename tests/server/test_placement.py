"""The placement decides the channel - and nothing else does.

A workspace record says where a turn belongs (`env_kind`). That fact resolves to
exactly one channel implementation; a placement with no implementation is
refused in typed terms rather than quietly running on another machine, and a
missing connector is the placement's refusal to give, not a construction gate.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
from agent_box.server.execution.local_channel import LocalSidecarLauncher
from agent_box.server.execution.placement import PlacementUnsupported, resolve_placement

PLUGIN = Path(__file__).resolve().parents[2] / "plugins" / "agent-box-harnesses"


def test_a_wsl_workspace_needs_a_connector_and_says_so():
    assert resolve_placement("wsl", has_connector=True).channel == "wsl-worker"
    with pytest.raises(PlacementUnsupported) as refused:
        resolve_placement("wsl", has_connector=False)
    assert refused.value.code == "WSL_CONNECTOR_UNAVAILABLE"


def test_a_local_workspace_needs_no_connector():
    placement = resolve_placement("local", has_connector=False)
    assert (placement.kind, placement.channel) == ("local", "local-process")


def test_a_named_but_unimplemented_placement_is_refused_not_downgraded():
    with pytest.raises(PlacementUnsupported) as refused:
        resolve_placement("ssh", has_connector=True)
    assert refused.value.code == "PLACEMENT_UNIMPLEMENTED"
    # A workspace that names no placement at all is refused too: the historic
    # "assume WSL" default is exactly what this resolution removes.
    with pytest.raises(PlacementUnsupported) as unknown:
        resolve_placement(None, has_connector=True)
    assert unknown.value.code == "PLACEMENT_UNKNOWN"


def _deployment(tmp_path: Path) -> Path:
    document = tmp_path / "deployment.json"
    document.write_text(json.dumps({
        "schemaVersion": 1,
        "harnesses": [{
            "id": "fixture",
            "adapter": {"command": "/usr/bin/node", "args": []},
        }],
    }), encoding="utf-8")
    return document


def _channel_for(tmp_path, monkeypatch, env_kind: str) -> str:
    """Which channel the product's own port factory builds for one placement."""
    import agent_box.server.bootstrap.runtime as runtime_module
    import agent_box.server.execution.local_channel as local_module
    import agent_box.server.execution.sidecar as sidecar_module

    chosen: dict = {}

    class RecordingWsl:
        def __init__(self, *_args, **_kwargs) -> None:
            chosen["channel"] = "wsl-worker"

    class RecordingLocal:
        def __init__(self, *_args, **_kwargs) -> None:
            chosen["channel"] = "local-process"

    monkeypatch.setattr(runtime_module, "_builtin_connector", lambda _id: object())
    monkeypatch.setattr(
        sidecar_module, "sidecar_bundle_files",
        lambda root, additional_files=None: dict(additional_files or {}),
    )
    monkeypatch.setattr(sidecar_module, "WslSidecarLauncher", RecordingWsl)
    # The builder imports both launchers at call time, so patching the source
    # module's attributes is what the product path actually reads.
    monkeypatch.setattr(local_module, "LocalSidecarLauncher", RecordingLocal)

    runtime = build_runtime_from_sidecar_deployment(
        tmp_path / "server", _deployment(tmp_path), plugin_root=PLUGIN,
    )
    try:
        frozen = runtime.objects.publish(json.dumps({"execution": {}}).encode())
        runtime.execution.port_factory({
            "harness_type": "fixture", "distribution": "Ubuntu", "remote_user": "tester",
            "connection_id": "connection", "remote_path": "/workspace",
            "env_kind": env_kind, "env_host": "Ubuntu", "normalized_path": "/workspace",
            "config_object_digest": frozen.digest,
        }, lambda *_args: None)
    finally:
        runtime.stop()
    return chosen["channel"]


def test_the_placement_picks_the_channel_through_the_product_path(tmp_path, monkeypatch):
    assert _channel_for(tmp_path, monkeypatch, "wsl") == "wsl-worker"


def test_a_local_workspace_runs_through_the_local_channel(tmp_path, monkeypatch):
    assert _channel_for(tmp_path, monkeypatch, "local") == "local-process"


def test_the_local_channel_is_the_one_that_runs_a_command_it_is_handed():
    """Its contract, stated as an attribute of the class: no host paths, no
    isolation mechanics, no Harness knowledge - it stages, runs, captures."""
    source = Path(LocalSidecarLauncher.__module__.replace(".", "/") + ".py")
    text = (Path(__file__).resolve().parents[2] / "src" / source).read_text()
    assert "compile_remote_sidecar_bwrap_argv" not in text
    assert "bwrap" not in text.replace("agent_box_sandbox_bwrap", "")
