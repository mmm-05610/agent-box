"""cmd2 REPL shell for agent-box.

Interactive msfconsole-style context-stack REPL with two entry modes:

- Default (no args): interactive prompt, tab-completion, history, auto-suggest
- ``exec``: run a command script and exit (AI-friendly)
"""
from __future__ import annotations

import sys
from typing import List

import cmd2

from .. import __version__, config
from ..core import library
from .commands.core import CoreCommands
from .commands.profile import ProfileCommands

# ── prompts ───────────────────────────────────────────────────────────────

_GLOBAL_PROMPT = f"{config.DISPLAY_NAME}> "
_CTX_PROMPT_FMT = "[{profile}:{agent_type}]> "

# ── intro banner (plain text — no Rich dependency at prompt level) ────────

def _banner() -> str:
    types = ", ".join(library.get_agent_types())
    return (
        f"\n  {config.DISPLAY_NAME} {__version__}\n"
        f"  agent types: {types}\n"
        f"  global:  list profiles, create <name>, use <name>, launch <name>\n"
        f"  context: apply provider <id>, remove mcp <id>, hooks show, back\n"
        f"  type ? for help, Ctrl+D to exit\n"
    )


class AgentBoxShell(cmd2.Cmd):
    """Interactive agent-box REPL with context-stack navigation."""

    allow_cli_args = False
    max_completion_items = 30

    def __init__(self, *args, **kwargs):
        super().__init__(
            *args,
            intro=_banner(),
            auto_suggest=True,
            enable_bottom_toolbar=True,
            include_py=False,
            include_ipy=False,
            persistent_history_file=str(config.history_file()),
            persistent_history_length=1000,
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
                "Ctrl+D exit  |  back  |  apply <resource> <id>  |  "
                f"remove <resource> <id>  |  hooks show/set/add/remove  |  "
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

    # ── unknown / profile-only commands ────────────────────────────────────
    # Commands that only exist inside a profile context (apply, remove,
    # hooks, options, back) are not registered in the global scope.  When
    # the user types them without `use <profile>` first, cmd2 reports "not
    # a recognized command" — confusing, since the command is valid.  Give
    # a friendly hint instead.

    _PROFILE_ONLY = {"apply", "remove", "hooks", "options", "back"}

    def default(self, statement: cmd2.parsing.Statement) -> bool | None:
        """Intercept unknown commands; hint for profile-only ones."""
        cmd = statement.command
        if cmd in self._PROFILE_ONLY:
            self.perror(
                f"{cmd} is only available in a profile context — "
                f"use <profile> first, then back to leave it"
            )
            return None
        return super().default(statement)

    # ── exit ──────────────────────────────────────────────────────────────

    def do_exit(self, _args) -> bool:
        """Exit the REPL."""
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

    A command that fails argument parsing does NOT abort the rest of the
    script — it is counted and execution continues.  Returns 1 if any
    command failed, else 0.  ``launch`` execs the agent and never returns
    to the script.
    """
    app = AgentBoxShell()
    app.register_command_set(CoreCommands())

    failures = 0
    for line in _split_script(script):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            stop = app.onecmd(line)
        except cmd2.exceptions.Cmd2ArgparseError:
            # Bad args — argparse already printed the usage.  Count it
            # and keep going so one typo doesn't kill the whole script.
            failures += 1
            continue
        except SystemExit:
            # `launch` execs the agent — never returns to the script.
            break
        if stop:
            break

    return 1 if failures else 0


def _split_script(script: str) -> List[str]:
    """Split a semicolon-separated script into individual commands.

    Splits on ``;`` only when NOT inside quotes, and keeps the
    original quoting intact — ``shlex.split`` would strip quotes and
    break argument values containing spaces (e.g. ``--display-name
    "My Codex"``).
    """
    parts: List[str] = []
    current: List[str] = []
    in_single = False
    in_double = False
    i = 0
    while i < len(script):
        c = script[i]
        if c == "'" and not in_double:
            in_single = not in_single
            current.append(c)
        elif c == '"' and not in_single:
            in_double = not in_double
            current.append(c)
        elif c == ";" and not in_single and not in_double:
            if current:
                parts.append("".join(current).strip())
                current = []
        else:
            current.append(c)
        i += 1
    if current:
        parts.append("".join(current).strip())
    return [p for p in parts if p]
