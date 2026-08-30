# Repository Restructure Phase 6 — Release Candidate

Date: 2026-08-30

# Verdict

READY EXCEPT EXTERNAL NATIVE REHEARSAL

Legacy deletion, Core/plugin boundaries, Root-only degraded install, Preview
wheel discovery, official plugin tests, offline real-tmux chain, frontend
checks, and documentation are complete. Native Codex/model execution was not
claimed: the environment exposes a Codex binary and login locator, but no
controlled native model Execution was run in this pass. This is an external
model/network rehearsal gate, not a code failure.

# Final repository structure

`src/agent_box/{cli,extensions,migrations,resource_contracts,work_core}` plus
`__init__.py`; official packages under `plugins/agent-box-{web,harnesses,git,tmux,artifacts}`
and the third-party Pi plugin remain separate.

# Deleted legacy paths

See [the deletion ledger](../../plans/archive/PHASE_6_LEGACY_DELETION_LEDGER.md). Fixed
workflow, old Profile/session authority, generic bwrap launch, duplicate
adapters/providers, REPL/GUI paths, root templates, and preview scripts were
deleted. No compatibility shim was needed.

# Retained Root modules and rationale

`work_core` is the frozen ontology, persistence, dispatch, observation and
finalization kernel; `extensions` is the provider-neutral SDK/discovery layer;
`resource_contracts` contains versioned contracts; `migrations` preserves
upgrade compatibility; `cli` contains only plugin/doctor/Host delegation.

# Compatibility shims, if any

None.

# Root CLI result

`plugins list`, `doctor`, `web`, and `launch` are present. Web/launch lazy
import `agent_box_web` and give a stable install hint without traceback when it
is absent. Root-only test passed.

# Preview installation command

```bash
pip install "agent-box-cli[preview]"
```

# Plugin ownership matrix

| Capability | Owner |
|---|---|
| Work/Execution/Binding/Dispatch/Ref/Evidence/finalization | Root Work Core |
| Web Host, Quick Launch, HTTP/static frontend | agent-box-web |
| Harness/Profile revision, Codex, continuation, credential locator | agent-box-harnesses |
| Repository/worktree/output capture | agent-box-git |
| tmux/pane/terminal attach | agent-box-tmux |
| immutable local artifacts | agent-box-artifacts |

# Duplicate authority audit

PASS: one Core DB authority (`work_core.db`), one Codex owner (Harnesses), one
Git owner, one tmux owner, one artifact owner, and one plugin entry-point group.

# Quick Launch result

PASS through the formal Web Host API and browser fixture: exact repository,
revisioned Profile, fresh/continue, managed/existing tmux, Binding Review,
explicit Freeze/Dispatch, terminal attach and explicit Finish are covered.

# Browser E2E

PASS: Quick Launch, Work E1→E2, Harness/Profile revision/import, and injected
terminal presenter coverage. Frontend tests: 6 passed.

# Offline native-chain E2E

PASS: real tmux plus offline fake Codex, output capture, terminal ACTIVE →
explicit Finish → TERMINAL, continuation E1 terminal → independent E2, and
Git output/worktree checks.

# Real Native Codex rehearsal

BLOCKED BY EXTERNAL REQUIREMENT / NOT CLAIMED. `codex` and its login command are
available and the locator file exists, but this RC pass did not execute a
model/network request. No native success is fabricated. Offline fake-native
path passes as above.

# Credential safety

PASS: no credential value, auth file content, token, or secret-shaped
environment was printed or entered Core/Binding/Evidence. Harness stores only
`codex-login/default` and uses a controlled projection.

# Clean-wheel result

PASS: Root wheel contains only Core/SDK/contracts/migrations and thin CLI; Web
wheel contains the current static bundle with one JS and one CSS asset. Preview
wheel discovery returned exactly READY official providers with no duplicate or
non-READY record.

# Tests

- Root Python suite: 83 passed.
- Official plugin suites: 89 passed.
- Frontend: 6 passed; lint/build passed with existing duplicate i18n and unused-import warnings.
- Root-only install, Preview install, `plugins list --json`, and `doctor --json`: passed.
- `git diff --check`: passed.
- `shell=True` and deleted-import scans: passed for active source.

# Documentation result

PASS: README/README_CN, docs index and architecture, SDK guide, plugin READMEs,
ledger and this RC report describe Core/plugin ownership, Preview install,
limitations and 1.x retirement.

# Remaining release blockers

Only the controlled real Native Codex rehearsal requiring external model/network
access. Existing frontend lint warnings should be cleaned before a final
stable release but do not block this Preview RC classification.

# Ready for checkpoint commit?

YES, after human review of the intentionally large legacy deletion diff.

# Ready for Preview recording?

YES for offline/plugin/browser recording; native claims must be omitted.

# Ready for Preview release?

READY EXCEPT EXTERNAL NATIVE REHEARSAL.
