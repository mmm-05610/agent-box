# agent-box-codex

Third-party Agent-Box plugin that registers two accountable Codex
`ExecutionProvider` adapters:

- `codex-app-server` for programmatic/reviewer executions;
- `codex-tmux-interactive` for a visible, attachable Codex TUI.

Install it into the same Python environment as Agent-Box:

```bash
python -m pip install -e ./plugins/agent-box-tmux
python -m pip install -e ./plugins/agent-box-codex
agent-box plugins list --json
```

The plugin registers the `agent-box.codex-continuation@1` Contract. Both
providers consume the host's generic workspace, prompt-fragment, and Agent-Box
profile Contracts plus the optional continuation Contract. The tmux provider
consumes `agent-box-tmux.console@1` or `agent-box-tmux.pane@1` (exactly one) and
therefore declares an explicit package dependency on `agent-box-tmux`.
Its runtime evidence is written lazily under
`$AGENT_BOX_HOME/plugins/codex/evidence/` when an Execution is dispatched;
plugin discovery itself does not create runtime data.

The tmux integration is intentionally product-specific. The tmux plugin owns
console materialization and pane operations; the Codex provider owns Codex
launch arguments, native SessionStart correlation, observation, and explicit
Finish. Agent-Box Core does not gain pane, terminal, or Codex concepts.

`codex-tmux-interactive` exposes the resolved console's attach command on its
returned handle. It records bounded SessionStart evidence and partial tmux
scrollback under `$AGENT_BOX_HOME/plugins/codex/evidence/`. A completed Codex
turn, idle TUI, or dead pane does not terminate the Core Execution; only the
provider's explicit `finish()` does.

## Evidence ceiling

Provider projections and observations are not proof that a resource was consumed.

## What this plugin cannot prove

It cannot prove that all resources were used, or that execution was fully
isolated, secure, or attested. Provider self-report is not independent verification.
