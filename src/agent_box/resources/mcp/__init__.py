"""MCP server management."""

from .crud import (
    delete_mcp_server,
    get_mcp_agents,
    get_mcp_server,
    list_mcp_servers,
    set_mcp_agent,
    upsert_mcp_server,
)
from .apply import (
    apply_mcp_server,
    list_profile_mcp_servers,
    remove_mcp_from_profile,
)

__all__ = [
    "apply_mcp_server",
    "delete_mcp_server",
    "get_mcp_agents",
    "get_mcp_server",
    "list_mcp_servers",
    "list_profile_mcp_servers",
    "remove_mcp_from_profile",
    "set_mcp_agent",
    "upsert_mcp_server",
]
