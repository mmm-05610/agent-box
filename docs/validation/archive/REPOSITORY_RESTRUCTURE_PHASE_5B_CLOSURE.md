# Verdict
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

COMPLETE / YES. Both audited Phase 5B gaps are closed. The rehearsal makes no
model or network call.

# Direct terminal opening result

Activity exposes Open terminal when a provider-owned attach descriptor exists,
and always retains Copy command. The presenter returns `opened`, `unavailable`,
or `failed` with bounded diagnostics and never writes terminal state to Core.

# Provider/Host ownership

`CodexTmuxHostControl` owns the validated attach descriptor. The Web Host owns
presentation in `application/terminal.py`; it is not an ExecutionProvider.

# Browser request security

The browser sends only `operation_id`. Host validation rejects extra fields,
re-obtains the descriptor from the registered control, and accepts no browser
argv, shell string, or executable path.

# WSL / Windows Terminal behavior

WSL uses argv equivalent to `wt.exe wsl.exe -d <WSL_DISTRO_NAME> -- <tmux
attach argv>` with `shell=False`. Missing distro or `wt.exe` returns explicit
`unavailable`; other platforms use the deferred presenter.

# Copy-command fallback

Copy command remains available after unavailable or failed terminal opening.

# Real tmux + fake Codex E2E

`test_real_tmux_codex_e2e.py` uses temporary home/repository, official Git,
tmux, Artifacts and Harnesses plugins, real tmux, and an offline fake Codex.
It proves exact workspace/Profile/responsibility Refs, managed console/pane,
fake process, execution-scoped `CODEX_HOME`, cwd, attach, output capture,
atomic finalization, and cleanup.

# Quick Launch result

Quick Launch prepares the normal Work/Execution draft and managed tmux
selector, leaving Review and Freeze explicit. The original browser fixture
passes; the real rehearsal uses the same formal Host API path.

# E1 terminal / E2 continuation result

E1 remains ACTIVE after attach/open, then explicit Finish yields TERMINAL and
durable Git output. A governed SessionRef creates E2 with an exact continuation
input, new workspace/console, and E1 remains TERMINAL.

# Explicit Finish proof

The fake process remains alive after launch and attach. Only Finish captures
scrollback, runs contributors/finalization, and changes the Core projection.

# Core changes, if any

None. Core ontology, schema, dispatch, projection and finalization semantics
were not changed.

# Browser E2E

Quick Launch browser E2E, Work E1→E2 browser E2E, and Harness/Profile browser
E2E pass. The product-loop browser path checks Open terminal using an injected
launcher, absence of argv/shell fields, ACTIVE after opening, and explicit
Finish.

# Tests

Focused presenter, real tmux/fake Codex, Web browser, frontend tests, lint and
production build pass. Existing frontend warnings remain. `git diff --check`
and boundary scans pass.

# Clean-wheel result

The Phase 5B clean-wheel/discovery/doctor baseline remains applicable; this
closure changes no package ownership or entry points.

# Remaining platform limitations

Visible automatic presentation is implemented only for WSL with Windows
Terminal `wt.exe`; other platforms return explicit deferred/unavailable status.

# Ready for Phase 6 legacy deletion?

No. Phase 5B is complete, but Phase 6 deletion was not started.
