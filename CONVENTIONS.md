# Agent-Box project conventions

## Architecture boundary

Keep Work Core provider-neutral. Core must not import concrete Web, Codex,
Git, tmux, Profile, Artifact, or credential implementations. Put provider
behavior in an official or third-party plugin and use the Plugin SDK for
registration. Do not add compatibility implementations for retired 1.x
paths.

## Changes and validation

Preserve historical migrations. Keep references typed and small; do not put
transcripts, checkpoints, artifact bytes, credentials, or provider payloads
inside Core records. Run focused Root and plugin tests, then the relevant
wheel and discovery checks.

## Repository hygiene

Generated files, runtime homes, databases, logs, worktrees, virtual
environments, and credentials are local-only. Research and validation records
must be clearly marked current, historical, or superseded. The only supported
frontend path is `plugins/agent-box-web/frontend/`.
