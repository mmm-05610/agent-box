"""cmd2 REPL shell for agent-box.

Interactive msfconsole-style context-stack REPL with two entry modes:

- Default (no args): interactive prompt, tab-completion, history, auto-suggest
- ``exec``: run a command script and exit (AI-friendly)
"""
from __future__ import annotations

import sys
from typing import List

import cmd2

from .. import __version__
from ..core import library
from .commands.core import CoreCommands
from .commands.profile import ProfileCommands

# ── prompts ───────────────────────────────────────────────────────────────

_GLOBAL_PROMPT = "agent-box> "
_CTX_PROMPT_FMT = "[{profile}:{agent_type}]> "

# ── intro banner (plain text — no Rich dependency at prompt level) ────────

def _banner() -> str:
    types = ", ".join(library.get_agent_types())
    return (
        f"\n  agent-box {__version__}\n"
        f"  agent types: {types}\n"
        f"  key commands: list, create, use <profile>, back, launch\n"
        f"  type ? for help, Ctrl+D to exit\n"
    )


class AgentBoxShell(cmd2.Cmd):
    """Interactive agent-box REPL with context-stack navigation."""

    intro: str = _banner()

    allow_cli_args = False
    max_completion_items = 30

    def __init__(self, *args, **kwargs):
        super().__init__(
            *args,
            auto_suggest=True,
            enable_bottom_toolbar=True,
            include_py=False,
            include_ipy=False,
            shortcuts={"?": "help"},
            **kwargs,
        )
        self._profile_ctx: ProfileCommands | None = None

        # Override cmd2's DEFAULT_PROMPT (set in super().__init__)
        self.prompt = _GLOBAL_PROMPT

    def get_context(self) -> "ProfileCommands | None":
        """Return the current profile context, or None."""
        return self._profile_ctx

    # ── hide cmd2 built-ins ─────────────────────────────────────────────

    _HIDDEN_BUILTINS = {
        "alias", "edit", "macro", "set", "shell", "shortcuts",
        "_relative_run_script", "run_pyscript",
    }

    def get_all_commands(self) -> list[str]:
        """Return visible commands, filtering out disabled built-ins."""
        return [
            c for c in super().get_all_commands()
            if c not in self._HIDDEN_BUILTINS
        ]

    # ── bottom toolbar ───────────────────────────────────────────────────

    def get_bottom_toolbar(self) -> str:
        """Status bar — context-aware hints."""
        if self._profile_ctx is not None:
            ctx = self._profile_ctx
            return (
                "Ctrl+D exit  |  back  |  provider / mcp / skill / hooks  |  "
                f"profile: {ctx.profile_name} ({ctx.agent_type})"
            )
        return "Ctrl+D exit  |  list  |  create  |  use <name>  |  ? help"

    # ── context management ────────────────────────────────────────────────

    def enter_context(self, profile_name: str, agent_type: str) -> None:
        """Load ProfileCommands and switch prompt."""
        if self._profile_ctx is not None:
            self.unregister_command_set(self._profile_ctx)

        ctx = ProfileCommands(profile_name=profile_name, agent_type=agent_type)
        self.register_command_set(ctx)
        self._profile_ctx = ctx
        self.prompt = _CTX_PROMPT_FMT.format(
            profile=profile_name, agent_type=agent_type
        )

    def leave_context(self) -> None:
        """Unload ProfileCommands and restore global prompt."""
        if self._profile_ctx is not None:
            self.unregister_command_set(self._profile_ctx)
            self._profile_ctx = None
        self.prompt = _GLOBAL_PROMPT

    # ── exit ──────────────────────────────────────────────────────────────

    def do_exit(self, _args) -> bool:
        """Exit agent-box."""
        self.poutput("goodbye.")
        return True

    do_quit = do_exit


# ── entry points ──────────────────────────────────────────────────────────


def run_repl() -> int:
    """Launch the interactive REPL."""
    app = AgentBoxShell()
    app.register_command_set(CoreCommands())
    sys.exit(app.cmdloop())


def run_exec(script: str) -> int:
    """Run a command script and exit (AI / automation entry point).

    Commands are semicolon-separated::

        agent-box exec "use mycc; provider apply minimax; mcp list"
    """
    app = AgentBoxShell()
    app.register_command_set(CoreCommands())

    for line in _split_script(script):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        app.poutput(app.prompt + line)
        stop = app.onecmd(line)
        if stop:
            break

    return 0


def _split_script(script: str) -> List[str]:
    """Split a semicolon-separated script into individual commands."""
    return [cmd.strip() for cmd in script.split(";") if cmd.strip()]
