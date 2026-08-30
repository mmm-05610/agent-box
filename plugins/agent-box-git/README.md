# agent-box-git

The external Git workspace plugin freezes a selector to a material `WorkspaceRef`
(`repository URI + exact commit + exact tree`), materializes an execution-owned
detached worktree, and captures the final index into an internal snapshot ref:
`refs/agent-box/executions/<execution-id>/output`.

Configure `$AGENT_BOX_HOME/plugins/git/config.json` with `repo` and optionally
`managed_root`. Configuration is read only on actual use; plugin discovery and
build have no Git or filesystem side effects. Ignored untracked files are not
captured; nested repositories and Git LFS contents retain Git's normal index
semantics. This plugin does not claim complete filesystem capture.

The `agent_box.plugins` entry point is the canonical registration source. It
registers the `git-workspace` ResourceProvider, Web-neutral selector, and
FinalizationContributor together; no independent component entry points are
needed.
