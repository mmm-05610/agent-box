# ordessa-server

Ordessa Server: the wire/1 HTTP/WS API, approvals, sessions, credentials
and ACP channel orchestration. Imports the governance core (`pacthold`)
and the harness plugin (`ordessa-harness`); it embeds neither.

Part of the Ordessa monorepo baseline (2026-09-25); migrated from the
historical `agent-box` repository (`src/agent_box/server`, branch
`work/hd002-bc-native`, commit `a0b343e0`).

## Install and run

```bash
pip install ./apps/server        # from the monorepo root
ordessa-server --host 127.0.0.1 --port 8900
# or: python -m ordessa_server
```

The server resolves its data root through `AGENT_BOX_HOME` (default
`~/.agent-box`), unchanged from previous releases.

## Known scope notes

- SSH/WSL remote execution legs (`agent-box-runtime-wsl`) are not part of
  the monorepo baseline; `ordessa_server.execution.ssh_connector` keeps its
  historical import and the placement layer refuses out loud when the
  connector is absent. See MIGRATION-TABLE.md in the migration workspace.
- Windows lockfile for the server closure: `lockfiles/server-windows-py312.txt`.

## Tests

```bash
python -m pytest tests/     # from this directory
```
