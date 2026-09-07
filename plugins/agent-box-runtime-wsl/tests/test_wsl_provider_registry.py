"""C2.2 canonical registry loading for the WSL provider pair."""
from importlib.metadata import EntryPoint

from agent_box.extensions.bootstrap import build_extension_environment


def test_canonical_environment_registers_both_wsl_provider_descriptors():
    entry_points = (
        EntryPoint(
            name="runtime-wsl",
            value="agent_box_runtime_wsl.plugin:create_plugin",
            group="agent_box.plugins",
        ),
        EntryPoint(
            name="workspace-wsl",
            value="agent_box_workspace_wsl.plugin:create_plugin",
            group="agent_box.plugins",
        ),
    )
    environment = build_extension_environment(entry_points=entry_points)

    assert {record.status for record in environment.report.records} == {"READY"}
    assert environment.registry.get_resource_provider("runtime-host-wsl").descriptor().id == (
        "runtime-host-wsl"
    )
    assert environment.registry.get_resource_provider("wsl-live-workspace").descriptor().id == (
        "wsl-live-workspace"
    )
