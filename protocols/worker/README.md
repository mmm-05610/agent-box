# AgentBox Worker wire v1

Wire version 1 retains the old Worker's `ABW1` binary envelope: a 60-byte
big-endian header followed by at most 64 KiB payload, with a SHA-256 payload
digest in the header. Payloads used by round 1 are strict UTF-8 JSON.

The bootstrap is a `Hello` frame on stream 0, sequence 1. Every request carries
the connection and Server instance identity. Execution operations also carry an
opaque attempt ID and positive generation; a PID is never sufficient identity.
The bootstrap also carries the control-protocol generation (`protocolVersion`,
currently 4) and two kinds of digest-pinned authorization: `executables`, single
files bound read-only at `/runtime/bin/<name>`, and `runtimeArtifacts`, real
directories bound read-only at `/runtime/artifacts/<name>` after the Worker
re-derives each declared tree digest inside the distribution. A generation
mismatch — in either direction — is a loud handshake refusal, never a silent
downgrade, and a bootstrap refusal is answered with a typed `WORKER_ERROR` frame
so the caller can classify it.
Generation 4 adds the persistent home operation family. A Profile's native
state lives in a durable directory on this machine — the machine that runs it —
and the Worker is the only process that touches files there:

- `home.prepare {locator, marker, window?}` resolves `locator` (`<role>` or
  `<role>/<native-home>`, one to two segments, each `^[A-Za-z0-9._-]{1,64}$`,
  `.` and `..` refused), creates the directory, and writes or verifies the
  ownership marker `<home root>/<role>/.agentbox-profile.json`
  (`markerState: "written" | "verified"`). A marker that names another product
  identity is a typed `HOME_MARKER_CONFLICT` refusal — two Profiles never share
  one home, and the Server translates this into its own
  `PROFILE_HOME_CONFLICT` wording. The optional `window` is a safe relative
  path created with `mkdir -p` inside the home, so the declared audit window
  exists before the Harness starts. The response's `path` is the resolved
  absolute home directory; it is for the channel's mount decision only and is
  never recorded by the Server.
- `home.list {locator, relative?}` walks the directory the way a view listing
  does (pinned fd, `O_NOFOLLOW` descent, symlinks skipped and counted in
  `skipped`), digesting every regular file within the audit bounds (1024
  files, 8 MiB per file, 64 MiB total, 4096 visited entries). Whatever did
  not fit is a reported fact — `truncated: {entries, bytes, oversize}` —
  never a silent omission and never a refused turn.
- `home.get {locator, path, offset, maxLength}` serves one bounded,
  digest-pinned chunk of one regular file, field-for-field like `view.get`.

Read-path refusals reuse the audited `view.*` code family; the home-specific
codes are `HOME_LOCATOR_INVALID`, `HOME_OUTSIDE_ROOT` (a resolved home that
escapes the home root, for example through a symlinked segment),
`HOME_NOT_FOUND` (a read against a home that was never prepared) and
`HOME_IO`. The home root is given by `--home-root` and defaults to the
Worker's own `$HOME/.agent-box/profiles`; it must sit outside the ephemeral
`--root`, which is deleted on exit, and nothing in the home is ever deleted
by an attempt ending, a `view.cleanup`, or the Worker exiting.

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
