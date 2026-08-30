# Repository Restructure Phase 5A — Legacy Profile and Capability Migration
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

## Verdict

COMPLETE for the scoped Profile/capability and read-only import slice. Phase
5B quick launch, project shortcuts, fresh/resume UX, and interactive launch UX
remain deliberately out of scope.

## Legacy inventory and mapping

The legacy source was inventoried without opening user credential files. The
old SQLite ProfileRepo and filesystem profile tree remain untouched. Legacy
metadata maps to the Harness-owned Profile revision; model/provider/endpoint,
instructions, MCP, Skills, native plugins, hooks, permissions, approval,
sandbox and bounded environment are represented in the revision's normalized
`config` and capability references. Runtime, cache, history, session,
transcript, PID and lock paths are ignored. Secret-looking fields are rejected
or recursively removed from an import preview.

## Profile schema and isolation

`agent_box_harnesses.profiles.schema` defines the versioned public field set
and bounded validation. Existing schema v1 digest bytes remain compatible when
the established `config` input is used. Revisions are still immutable JSON
files with exact ProfileRef `(profile_id, revision, digest)` and drift fails
closed. Projection keeps an immutable base/config manifest, an execution-local
writable overlay, and shared capability refs. Two executions receive distinct
overlay directories while shared refs retain identical identity. Cleanup only
removes the execution projection.

## Importers

`agent_box_harnesses.importers.legacy_agent_box` reads constrained JSON exports
or JSON files in a selected legacy directory. `cc_switch` reads a cc-switch /
ACS export object, not the mutable ACS database. Both provide candidate
discovery, normalized preview, ignored/rejected field lists, provenance source
digest, capability refs, credential locator and warnings. Confirmation is
explicit, writes only a new Harness revision, never writes the source, and
replays with the same source identity/digest idempotently. Existing targets
require an expected revision and produce the next immutable revision.

cc-switch is therefore an external configuration source only; it is not a
Profile or credential authority and is not a runtime dependency. Fixtures
proved the format path (`FORMAT VERIFIED`), not local user data availability.

## Secret and credential boundary

No test reads a real secret. API keys, tokens, passwords, auth files, cookies,
credential caches and nested `env`/`headers` values never enter preview,
Profile, Binding, Evidence or HTTP output. Native login is represented by a
CredentialSourceRef locator. The Web UI displays locator/status only.

## Web/API and Studio

The Web Host exposes provider-neutral Harness operations for import sources,
candidates, preview and explicit confirmation. Harness Studio now supports
structured model/provider/endpoint, instructions, MCP/Skills/native plugin
refs, hooks/policy fields, credential locator, projection preview and the
preview-then-confirm import flow. It has no raw unrestricted config editor and
uses the real Harness API.

## Tests and packaging

- importer and Harness tests: 34 passed; new importer tests: 5 passed;
- full Python suite: 283 passed, 1 skipped (pre-existing environment skip);
- frontend tests: 6 passed; lint/build passed with pre-existing warnings;
- existing Web browser regressions: 2 passed, not skipped;
- root and Harness wheels built successfully; the Harness wheel contains the
  importer/schema modules; no agent-box-codex or preview-resources package was
  restored;
- `git diff --check` passed and the formal source boundary scan found no old
  Web/Codex imports.

Native Codex/model execution was not run. No Work Core file, ontology, schema,
or execution semantic was changed. Existing dirty worktree changes were
preserved.

## Remaining Phase 5B work

Project shortcut selection, legacy `use/apply/launch` replacement, fresh and
resume UX, tmux attach UX, and interactive terminal launch remain for Phase
5B. Legacy source remains intentionally available for the later retirement
phase.
