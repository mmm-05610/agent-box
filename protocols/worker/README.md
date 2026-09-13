# AgentBox Worker wire v1

Wire version 1 retains the old Worker's `ABW1` binary envelope: a 60-byte
big-endian header followed by at most 64 KiB payload, with a SHA-256 payload
digest in the header. Payloads used by round 1 are strict UTF-8 JSON.

The bootstrap is a `Hello` frame on stream 0, sequence 1. Every request carries
the connection and Server instance identity. Execution operations also carry an
opaque attempt ID and positive generation; a PID is never sufficient identity.
Child stdout/stderr never share the Worker control stream. They are bounded
captured results fetched in digest-pinned chunks after a terminal event.
Spawn may carry at most 4 KiB of base64 stdin, which the Worker writes through a
pipe and closes; user prompts therefore do not enter process argv. Committed
views expose metadata-only listing followed by path-specific, digest-pinned
fetch so a Harness can classify native state before any file content is read.

The schema in `v1.schema.json` is the canonical JSON contract. `golden/` fixes
the cross-language empty-frame bytes and representative accepted/rejected JSON.
Limits are also returned by the handshake and come from Worker constants.
