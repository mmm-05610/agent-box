# AgentBox Worker wire v1

Wire version 1 retains the old Worker's `ABW1` binary envelope: a 60-byte
big-endian header followed by at most 64 KiB payload, with a SHA-256 payload
digest in the header. Payloads used by round 1 are strict UTF-8 JSON.

The bootstrap is a `Hello` frame on stream 0, sequence 1. Every request carries
the connection and Server instance identity. Execution operations also carry an
opaque attempt ID and positive generation; a PID is never sufficient identity.
The bootstrap also carries the control-protocol generation (`protocolVersion`,
currently 3) and two kinds of digest-pinned authorization: `executables`, single
files bound read-only at `/runtime/bin/<name>`, and `runtimeArtifacts`, real
directories bound read-only at `/runtime/artifacts/<name>` after the Worker
re-derives each declared tree digest inside the distribution. A generation
mismatch — in either direction — is a loud handshake refusal, never a silent
downgrade, and a bootstrap refusal is answered with a typed `WORKER_ERROR` frame
so the caller can classify it.
Child stdout/stderr never share the Worker control stream. They are bounded
captured results fetched in digest-pinned chunks after a terminal event.
Spawn may carry at most 4 KiB of base64 stdin, which the Worker writes through a
pipe and closes; user prompts therefore do not enter process argv. Committed
views expose metadata-only listing followed by path-specific, digest-pinned
fetch so a Harness can classify native state before any file content is read.

The schema in `v1.schema.json` is the canonical JSON contract. `golden/` fixes
the cross-language empty-frame bytes, representative accepted/rejected JSON, and
the runtime artifact tree fixtures `runtime-artifact-tree-v1.json` and
`runtime-artifact-tree-v1-single.json`. Those record a tree's entries plus the
exact canonical encoding bytes and digest of it, so the Python and Rust
implementations can be checked against each other without either being its own
reference: `plugins/agent-box-sandbox-bwrap/src/agent_box_sandbox_bwrap/artifacts.py`
and `workers/agent-box-worker/src/artifacts.rs`. Limits are also returned by the
handshake and come from Worker constants.
