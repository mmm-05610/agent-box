# Agent-Box Harnesses

The official multi-Harness extension package. Codex is currently the first
official Harness integration.
It owns the Codex Harness descriptor, versioned Profile repository, exact
`ProfileRef`, selector, digest validation, and execution-scoped projection.

The Harnesses distribution is the sole Codex owner. It directly registers the
App Server and tmux interactive modes and owns profile, projection,
credential-locator, and launch-spec handling.

Native continuation is represented by the Harness-owned
`codex-continuation` ResourceProvider. A continuation candidate is only
offered from a terminal Execution with an observed native SessionRef; it
creates a new Execution and never reopens the source.

Build from a clean checkout with the Web static tree first, then build the
Web and Harness wheels:

```sh
npm --prefix ../agent-box-web/frontend run build
python3 -m build
```

Profiles are immutable JSON revisions under the plugin data directory. Only
non-secret configuration and credential locators are accepted. The projection
manifest contains identity and references, never credential values.

Codex official subscription login uses the fixed `codex-login/default`
`CredentialRefV1` locator. Dispatch prepares an execution-scoped read-only
SecretMount for `/runtime/home/auth.json`; no auth symlink, path, value, hash,
or raw credential editor is supported. Other Harness credential materializers
remain deferred.
