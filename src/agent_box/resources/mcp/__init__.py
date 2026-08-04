"""MCP server management — apply only. CRUD is done in ACS."""

from .apply import (
    apply_mcp_server,
    list_profile_mcp_servers,
    remove_mcp_from_profile,
)

__all__ = [
    "apply_mcp_server",
    "list_profile_mcp_servers",
    "remove_mcp_from_profile",
]
