from .codex import CodexAdapter
from .claude import ClaudeAdapter
from .opencode import OpenCodeAdapter
from .hermes import HermesAdapter
from .pi import PiAdapter
from .generic_cli import GenericCliAdapter
ADAPTERS={"codex":CodexAdapter("codex"),"claude":ClaudeAdapter("claude"),"opencode":OpenCodeAdapter("opencode"),"hermes":HermesAdapter("hermes"),"pi":PiAdapter("pi")}
