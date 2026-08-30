# Documentation Closure — 2026-08-30

# Verdict

COMPLETE FOR DOCUMENTATION CLOSURE

The current documentation now has one entry point, a Core/plugin architecture
guide, frozen contracts, current ADRs, explicit Preview guidance, and separated
historical evidence. No implementation, schema, migration, or Core semantic
file was changed.

# Final docs tree

```text
docs/
  README.md
  DOCUMENTATION_INVENTORY.md
  architecture/ARCHITECTURE.md
  architecture/LOCAL_WEB_HOST_AND_WORKBENCH.md
  contracts/work-core/v0_1/
  adr/
  plugins/PLUGIN_SDK.md
  getting-started/RELEASE.md
  plans/current/  plans/archive/
  validation/current/  validation/archive/
  research/  research/archive/
  demos/  demos/archive/
  archive/
```

The docs root contains only the canonical README and inventory. `docs/index.md`
was removed as a duplicate entry.

# Canonical documentation

`docs/README.md`, `docs/architecture/ARCHITECTURE.md`,
`docs/plugins/PLUGIN_SDK.md`, the nine files under
`docs/contracts/work-core/v0_1/`, and the ADRs are the authoritative path.
The docs state that Agent-Box is an execution governance/control layer, not a
Web-only workflow product.

# Archived documentation

Completed plans, old GUI/TUI/WorkBoard material, superseded architecture maps,
historical validation, old specs, and research attack rounds are under archive
directories. Archive READMEs explain that these documents preserve history and
are not implementation guidance; 157 archived files carry an explicit
Historical record banner.

# Deleted duplicates

Removed duplicate `docs/index.md`. Requirements, Roadmap, Release, completed
plans, old validation entries, and retired product documents were moved to
appropriate archive locations rather than silently deleted.

# Updated current architecture claims

Current docs describe external Hosts/workflows as owners of progression,
routing, retry, scheduling, and runtime policy. Core owns Work, Execution,
Binding, Dispatch, Ref, Resource Observation/Evidence, and atomic finalization.
Web is an optional Local Host providing Quick Launch and observation/control;
LangGraph, GitHub, Sandbox, and future workflow integrations are not claimed
as implemented.

# Contracts and ADR status

All nine frozen Work Core contracts remain under the formal contracts path and
all ten ADRs are marked as current architectural decisions. Broken references
to deleted Core provider modules and WorkBoard rendering were replaced with
current Core/plugin references where the decision remains applicable.

# Research organization

Decision-oriented research remains in `docs/research/`; multi-round attack,
synthesis, and superseded audits are grouped in `docs/research/archive/`.

# Plans organization

Only `plans/current/PREVIEW_RELEASE_CHECKLIST.md` is an active plan. Completed
Phase 1–6 and transition plans are in `plans/archive/` and are not presented as
next steps.

# Validation organization

`validation/current/` contains current release evidence, Native Codex safety
constraints, Phase 6 closure, and its README. Earlier implementation-specific
reports remain in `validation/archive/` with their original claims intact.

# Demo documentation status

The demos README defines the current evidence goals: Binding, native execution,
explicit Finish, and output/evidence reconciliation. Old multi-pane/TUI and GUI
runbooks are archived. No unimplemented LangGraph workflow is presented as a
current demo.

# Root README result

English and Chinese README links now point to the canonical docs entry, the
archived migration record, and current release evidence. Package names,
Preview install command, plugin ownership, Pi positioning, and Native Codex
rehearsal limitation are aligned.

# Plugin README result

Official plugin READMEs remain package-local. Pi is explicitly third-party/
example and no longer describes WorkBoard as an authority. No plugin README
contains a broken local docs link.

# Broken links fixed

Current link check covered 49 current Markdown/README files and found zero
missing local links. Historical links that point to deleted implementations
remain only in archived records and are not used by current documentation.

# Remaining stale references

Current closure evidence intentionally names retired paths when recording what
was removed. Archived research and validation intentionally retain their
original terminology. No current quickstart, architecture, contract, SDK, or
release guide depends on those paths.

# Remaining documentation debt

Frontend lint warnings and the future coordinated version policy remain code or
release work, not documentation closure blockers. Native Codex rehearsal is
still external and must not be implied by this report.

# Tests

- Current local Markdown link check: passed, 0 missing links.
- Current stale-path scan: no obsolete implementation links.
- `git diff --check`: passed.
- Core/plugin implementation was not modified or retested by this documentation
  task.

# Ready for clean checkpoint?

YES for documentation review and checkpoint inclusion. Staging and commit were
not performed.
