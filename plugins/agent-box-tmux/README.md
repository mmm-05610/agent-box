# agent-box-tmux

Third-party Agent-Box plugin that registers a versioned tmux console Contract
and a ResourceProvider. It is packaged independently from Agent-Box Core and
is discovered through the standard `agent_box.plugins` Python entry-point
group.

Install for local development:

```bash
python3 -m pip install -e ./plugins/agent-box-tmux
agent-box plugins list
```

The provider materializes a dedicated tmux server/session and returns its
native session and pane identities. It also exposes
`make_existing_pane_ref("%3")`, which freezes a `TmuxPaneV1` identity using the
actual socket path, server PID, session/window/pane IDs, and a replacement
policy (`idle-shell-only` by default or explicitly `force-replace`). An
ExecutionProvider may then project participant commands into those panes. The
plugin does not add tmux concepts to Work Core.

The package also exports a small tmux-specific `TmuxConsoleController` used by
explicit consumers such as `agent-box-codex`. It supports race-free pane
launch, pane observation, scrollback capture, and cleanup. This is not a
generic Agent-Box console protocol; a shared protocol should only be extracted
after another real console product demonstrates the same contract.

## Evidence ceiling

tmux identity and pane state are projected runtime facts, not proof of consumption.

## What this plugin cannot prove

This plugin cannot prove all resources were used or claim fully isolated, secure, or attested execution.
