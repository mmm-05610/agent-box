# Agent-Box contributor notes

Read [CONVENTIONS.md](CONVENTIONS.md), [docs/README.md](docs/README.md),
[docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md), and the relevant official plugin
README before changing code.

The repository is organized as a provider-neutral Root Core plus independent
plugins. Core owns Work, Execution, Binding, Dispatch, Ref, Evidence, and
atomic finalization. Web, Harness, Git, tmux, and Artifacts behavior belongs
to the corresponding plugin.

Use `pip install -e .` for Root-only work. For Preview contributor work,
install the Root and official plugins editable. Frontend commands run from
`plugins/agent-box-web/frontend/`; its build output is owned by the Web
plugin's `_static/` package-data tree.

Runtime homes, logs, worktrees, and generated evidence are local-only and
must not be committed. Never inspect or print credential values.
