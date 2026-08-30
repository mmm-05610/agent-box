# Repository Restructure Phase 2 — Harness Independence
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Date: 2026-08-30
Base checkpoint: `197c41a`

## Verdict

COMPLETE for Harness Profile/Projection/credential/launch ownership. Phase 3
Codex consolidation was not started.

## Dependency closure

Before this phase, the official Harness path had these legacy dependencies:

- `agent_box_harnesses.codex.runtime.CodexProfileProvider` subclassed
  `AgentBoxProfileResourceProvider` from
  `agent_box.work_core.providers.resources`;
- `agent_box_harnesses.codex.manager` imported the root
  `profile_contract_digest` helper;
- `agent_box_harnesses.codex.launch` imported root `agent_box.launch.LaunchPlan`;
- the Harness test `test_codex_wiring.py` imported Web Host
  `agent_box.application.facade.HostApplication`.

After the refactor, formal Harness source imports only public extension,
resource-contract, and Work Core protocol surfaces plus its own Profile,
Projection, Credential, and Launch modules. Static boundary tests reject
legacy Profile/Launch/resources/Web imports. The Harness suite collects and
runs without `agent_box_web` installed or exposed.

The only temporary Codex dependency is the explicit composition in
`agent_box_harnesses.plugin`: it imports `agent_box_codex.plugin.CodexPlugin`,
selects its App Server provider, and injects the Harness-owned launch adapter.
This is documented as a Phase 3 removal boundary. `agent-box-codex` has no
entry point, and the official registration still exposes exactly one
`codex-app-server` provider and one `codex-profile` authority.

## Harness ownership after refactor

`agent-box-harnesses` now owns:

- immutable JSON Profile revisions and canonical SHA-256 digest;
- exact `ProfileRef` construction and revision/digest resolution;
- secret-looking field validation and disabled metadata;
- Codex Profile `ResourceProvider` implementation;
- execution-scoped projection and writable overlay directories;
- shared capability reference identity;
- locator-only Codex credential projection and cleanup;
- `CodexLaunchSpec`, including argv, cwd, bounded environment,
  execution-local `CODEX_HOME`, projected paths, Profile revision/digest,
  credential locator, and cleanup directory.

`CodexProfileProvider` directly satisfies the public ResourceProvider protocol;
it no longer subclasses a root concrete provider. The digest algorithm and
ProfileRef metadata shape were not changed. A compatibility pin test preserves
the pre-extraction digest for the canonical `Main`/`gpt-5` fixture.

## Credential safety

Credential input remains a typed-by-validation locator dictionary for
`codex-login/default`. The source auth file is only exposed through a
controlled projection link. The locator and projection method may appear in
the manifest; the credential value is never persisted, returned, put in the
launch environment, or included in protocol/evidence output. Cleanup removes
the link while preserving the source.

## Root legacy retirement candidates

No root legacy implementation was deleted in this phase. Candidates for a
later Legacy Retirement phase are:

- `src/agent_box/resources/profile.py` — legacy SQLite/profile-template
  authority;
- `src/agent_box/resources/sessions.py` — legacy PID/session tracker;
- `src/agent_box/launch.py` — generic bwrap/profile launch orchestration;
- the Profile-specific portions of
  `src/agent_box/work_core/providers/resources.py`;
- the remaining compatibility/runtime imports in `agent-box-codex`, to be
  handled only during Phase 3 consolidation.

These files remain because they still belong to broader legacy/compatibility
scope. The official Harness path no longer calls them for Profile projection
or launch planning.

## Validation

| Gate | Result |
|---|---|
| Harness tests without Web installed | PASS — 11 passed |
| Web Host tests, including migrated Host integration | PASS — 14 passed |
| Codex plugin tests | PASS — 18 passed |
| Root Core/extension tests | PASS — 52 passed |
| Frontend tests | PASS — 6 passed |
| Frontend lint | PASS with existing 4 warnings |
| Frontend production build | PASS |
| Browser E1→E2 | PASS |
| Harness/Profile browser E2E | PASS |
| Full old `agent_box.application/server` import scan | PASS — no matches |
| Harness forbidden dependency scan | PASS — no matches |
| Root/Web/Harness/Codex/tmux/Git/preview wheels | PASS |
| Clean-wheel plugin discovery | PASS — one Harness owner, one Codex provider/profile authority |
| Clean-wheel `doctor --json` | PASS |
| Clean-wheel `agent-box web --no-browser` and health | PASS — HTTP 200 |
| `git diff --check` | PASS |

Real Native Codex/model execution was intentionally not run because it could
produce external requests or quota consumption. Fake protocol tests remain
the lifecycle validation boundary.

## Next phase

The repository is ready for Phase 3 Codex consolidation. That phase may move
the temporary Codex runtime boundary into the official Harness distribution;
this Phase 2 change does not do so. Work Core ontology and semantics were not
modified, and all pre-existing unrelated dirty-worktree changes were
preserved.
