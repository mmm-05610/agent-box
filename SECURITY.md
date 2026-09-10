# Security Policy

## Reporting a vulnerability

Report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/NousResearch/hermes-agent/security/advisories/new)
on the Hermes Agent repository. Do not open a public issue for a security problem.

Please include: what you found, how to reproduce it, the affected version (app
version and, if relevant, the `hermes` runtime version it was connected to), and
your platform.

We will acknowledge receipt and keep you updated on the fix. Please give us a
reasonable window to ship a fix before disclosing publicly.

## Scope

**In scope — this repository (Hermes Desktop, the Electron client):**

- The Electron main process, preload bridge and IPC surface
- The React renderer (including anything that could escape the sandbox, load
  remote content, or leak filesystem paths)
- Backend resolution and process supervision: how a `hermes` executable is
  found, probed, spawned, and authenticated to
- Bundled packaging: entitlements, notarization, update hand-off
- The shared JSON-RPC transport in `apps/shared`

**Out of scope here — report upstream to Hermes Agent:**

- The Hermes runtime itself: the agent loop, tools, session storage, the CLI,
  messaging adapters, and the `hermes serve` API surface
- Anything requiring a malicious `hermes` runtime on the user's machine to be
  already running as that user

**By design, not a vulnerability:**

- The app launches an external `hermes` executable the user installed, and gives
  it the user's privileges. That is the product boundary, not an escalation.
- The app connects to a user-supplied remote gateway URL when the user
  configures one.

## Supported versions

Only the latest released app version is supported. Because the app drives an
external runtime, pair it with a current `hermes`; a runtime older than the
`serve` subcommand still works through the documented `dashboard --no-open`
fallback, but is not a supported security configuration.
