"""The registration path for the WSL host connector.

The Server resolves a host connector by name (the installed plugin entry point
``agent_box.plugins`` → ``runtime-wsl``); this module is the factory that name
resolves to. It keeps the constructor arguments explicit - the Server passes the
machine-local bindings (which manifest pins the Worker, where it lives on the
remote host) and gets back the connector it can use, without importing this
package's module path itself.
"""
from __future__ import annotations


def create_connector(*, manifest_path: str, linux_worker_path: str,
                     server_instance_id: str):
    """Build the WSL connector from the Server's machine-local bindings."""
    from .connector import WslConnector

    return WslConnector(
        manifest_path=manifest_path,
        linux_worker_path=linux_worker_path,
        server_instance_id=server_instance_id,
    )


create_connector.entry_point_name = "runtime-wsl"

__all__ = ["create_connector"]
