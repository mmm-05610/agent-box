# Agent-Box 2.0.0a1 Developer Preview

Agent-Box is an execution governance layer for AI coding agents. It resolves
exact external resources, freezes them into an Execution Binding, dispatches a
native Harness, and preserves outputs and evidence across executions.

This is a Developer Preview with an experimental API. It is not a production
stable release, complete Agent Workflow platform, built-in workflow engine,
scheduler, router, retry system, or production sandbox.

## Install

### GitHub wheelhouse

Download all release assets into one directory, then run:

```bash
pip install --pre --find-links . "agent-box-cli[preview]==2.0.0a1"

The preview bundle includes the official `agent-box-skills` immutable local
Agent Skills provider. Import is explicit and local; no HOME scan or remote
fetch is performed.
agent-box doctor --json
agent-box plugins list --json
agent-box launch
```

### Source checkout

Clone this repository and install the preview packages from the checkout;
ordinary PyPI installation is not available for this preview.

Root-only installs remain valid for `plugins list`, `doctor`, and version/help;
`web` and `launch` return an actionable install message when the Web plugin is
absent. Contributor installs use `pip install -e .` plus editable official
plugins.

## Product path

Quick Launch prepares a Work, accountable Execution, exact repository/revision,
immutable Profile revision, fresh/continuation input, and managed or observed
tmux target. The user reviews the Binding, freezes and dispatches explicitly,
opens or copies the provider-owned terminal attach command, and finishes
explicitly. A terminal output becomes a WorkspaceRef for a new Execution.

## Preview limits and migration

Preview is local-only and uses one official Harness registry for Codex, Claude Code,
OpenCode, Hermes, and Pi. Native provider/model access,
tmux, Git, and terminal presentation depend on the host platform. No legacy
Profile/session database, 1.x fixed workflow, TUI, PyWebView, or browser shell
is part of the supported path. See [docs/README.md](docs/README.md), the
[migration record](docs/plans/archive/PHASE_6_LEGACY_DELETION_LEDGER.md), and
the [current release evidence](docs/validation/current/REPOSITORY_RESTRUCTURE_PHASE_6_RELEASE_CANDIDATE.md),
and the [five-Harness consolidation report](docs/validation/current/FIVE_HARNESS_REGISTRY_CONSOLIDATION.md).
