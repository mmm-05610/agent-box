# C2.2 WSL workspace RED evidence

This directory was intentionally created with the formal tests before the
provider implementation. The initial command was:

```text
python3 -m pytest plugins/agent-box-workspace-wsl/tests/test_workspace_wsl.py -q
```

Expected RED: test collection fails with `ModuleNotFoundError:
No module named 'agent_box_workspace_wsl'`, because the WSL workspace plugin
did not exist in the old implementation.

The tests require a remote project identity bound to a connection and an
exact remote path. They also require forged connection/project/path metadata
to fail closed and require path mapping without creating a local copy.
