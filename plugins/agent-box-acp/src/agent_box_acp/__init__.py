"""agent-box-acp: generic Agent Client Protocol (ACP) client engine.

A standalone, Harness-neutral protocol runtime.  It knows nothing about
any specific coding agent, carries no canonical Observation vocabulary and
makes no network calls on its own — it moves protocol bytes to and from an
already-spawned peer.
"""

__version__ = "2.0.0a1"

from .errors import AcpEngineError, AcpErrorCode
from .framing import FrameDecoder, decode_line, encode_message
from .message import (
    RpcFailure, RpcMessage, RpcNotification, RpcRequest, RpcSuccess, classify,
)
from .transport import (
    DuplexByteTransport, MemoryDuplexTransport, PipeDuplexTransport,
)
from .engine import (
    AgentCapabilities, AgentInfo, AcpClientEngine, DiagnosticEvent,
    InboundEvent, PeerRequestEvent, PermissionOption, PermissionRequest,
    UpdateEvent, parse_agent_capabilities,
)

__all__ = [
    "AcpClientEngine",
    "AcpEngineError",
    "AcpErrorCode",
    "AgentCapabilities",
    "AgentInfo",
    "DiagnosticEvent",
    "DuplexByteTransport",
    "FrameDecoder",
    "InboundEvent",
    "MemoryDuplexTransport",
    "PeerRequestEvent",
    "PermissionOption",
    "PermissionRequest",
    "PipeDuplexTransport",
    "RpcFailure",
    "RpcMessage",
    "RpcNotification",
    "RpcRequest",
    "RpcSuccess",
    "UpdateEvent",
    "classify",
    "decode_line",
    "encode_message",
    "parse_agent_capabilities",
]