# P18 G4 — launch smoke against a running Pacthold service

Command (Windows, from `apps/desktop`):

```
$env:AGENTBOX_SERVER_SOURCE_ROOT = '\\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box-server-round1'
$env:AGENTBOX_SERVER_LINUX_ROOT  = '/home/maoqh/projects/agent-box-server-round1'
$env:AGENTBOX_WIRE_SCHEMA        = '<repo>\docs\desktop-product-delivery\contracts\wire-v1\generated\wire-v1.schema.json'
node e2e\p42-fullstack-integration-driver.mjs <sandboxRoot> <outDir>
```

Result: **executed 22 → allOk=true; counts {PASS 22, FAIL 0, SKIP 0, PENDING 0}**; server port 18751,
`server.hello` protocol `wire/1`, 27 capabilities; the full no-model round covers workspace open,
profile/provider-model, config.resolve, a complete turn with persisted deltas, idempotent replay,
queue withdraw, stop semantics, history pagination, provider/model maintenance, session rename/pin/switch
(confirmed), send outcome query, attachment delivery (body not in transcript), approval round trip,
event resync, archive-keeps-history, clean shutdown (port freed, token file present).

## Driver maintenance required by the current Server CLI (not a wire change)

The Server now **refuses** `--sidecar-deployment` documents that carry a host path
(`SIDECAR_DEPLOYMENT_HOST_PATH`) and **requires** `--plugin-root` on the command line. The driver was
updated accordingly (`e2e/p42-fullstack-integration-driver.mjs`): `pluginRoot` removed from the deployment
document, `--plugin-root <backend>/plugins/agent-box-harnesses` added to the Server argv. No wire, backend
or product change; the backend repository was used read-only and the Server's data root lived in the
run's own sandbox (`server-data/` under the sandbox root).

## What this proves and what it does not

Proves: the rebuilt **Ordessa** application (new identity, `ordessa://`, renamed executable) installs the
lifecycle connection to a running **Pacthold** service from its data root and completes the full no-model
round over the production transport. Does not prove: real-model rounds (explicitly out of scope, no
credential read), platform installer tests (not run).
