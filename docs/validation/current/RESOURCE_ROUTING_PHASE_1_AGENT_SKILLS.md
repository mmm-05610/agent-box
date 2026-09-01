# Resource Routing Phase 1: Agent Skills

## Verdict

COMPLETE / READY FOR RESOURCE ROUTING PHASE 2

## Skill contract

Root owns the frozen `agent-box.skill@1` contract. It contains only bounded
provider-neutral identity, metadata, provenance and a canonical file summary.
Resolved source access is an ephemeral private capability and is absent from
Refs, JSON, evidence and Web responses.

## Skill provider authority

`agent-box-skills` is the sole `agent-skills` ResourceProvider and `agent-skill`
selector. It has no execution, profile, credential, sandbox or Harness
responsibility.

## Store/revision/digest

Explicit local `SKILL.md` directory import creates immutable revisions under
the plugin data directory. Import rejects links, special files, traversal,
oversized trees and invalid frontmatter. Canonical sorted file manifests are
SHA-256 addressed; CAS, replay-idempotent import, disable metadata and exact
resolve are fail-closed. No HOME scan or remote fetch occurs.

## Import boundary

Web exposes bounded local preview/confirm endpoints. The host canonicalizes an
explicit path and never returns it. Confirmation consumes a short-lived
in-process preview token; no credential-shaped metadata is imported.

## SkillRef identity

`ArtifactRef(provider="agent-skills", native_id=skill_id, metadata={revision,
digest, format="agent-skills"})` is the only supported identity. Legacy
provider IDs are rejected and existing frozen refs are not rewritten.

## Five Harness declarations

All five declarative definitions declare optional `agent-box.skill@1` slots
bounded to 32 values. The generic factory derives input limits and selector
compatibility; no Harness-specific Web mapping exists.

## Native layout matrix

| Harness | lossless guest target |
|---|---|
| Codex (`CODEX_HOME=/runtime/home`) | `/runtime/home/skills/<id>` |
| Claude Code (`CLAUDE_CONFIG_DIR=/runtime/home`) | `/runtime/home/skills/<id>` |
| OpenCode (`OPENCODE_CONFIG_DIR=/runtime/home`) | `/runtime/home/skills/<id>` |
| Hermes (`HERMES_HOME=/runtime/home`) | `/runtime/home/skills/<id>` |
| Pi | `/runtime/home/skills/<id>` |

The target configuration was checked against the local CLI/offline launch
contracts and the official Claude, OpenCode and Pi directory documentation.
The generic CLI adapter sorts sources, rejects target collisions, and emits
read-only `skill-tree` declarations. Skill snapshots are never copied into a
Profile revision.

## Sandbox projection

The existing Runtime Composition path consumes the declarations and produces
the existing projection receipt/read-back path. Projection is execution-local,
read-only and digest-bound; cleanup never removes the shared snapshot.

## Evidence levels

Resolve is `RESOLVED`; verified Runtime Composition with digest read-back is
`PROJECTED`; the fake Harness targets actually open and read `SKILL.md` and
emit a bounded `SKILL_LOADED:<id>:<digest>` marker, recorded as `LOADED`.
`CONSUMED` is absent because no model request is executed.

## Five offline verticals

The formal offline suite executed all five adapters. Codex, Claude Code,
OpenCode, Hermes and Pi each opened their exact native target and validated the
digest marker. The suite also ran real bwrap direct-stdio and real managed tmux
coverage; execution remained ACTIVE until explicit Finish and cleanup preserved
the shared snapshot.

## Web/Quick Launch

Catalog discovery exposes `agent-skill` only to execution providers declaring
the contract. Multi-slot selection remains explicit and exact refs are shown
in Binding Review. Web does not know Harness native paths.

## Security result

No source path, secret, credential value, runtime handle or arbitrary shell is
stored in a Ref or public contract. Snapshot files are regular files with
normalized modes and bounded names, size, depth and count.

## Core changes, if any

No Work Core ontology, Binding, Freeze, Dispatch, Finalization, schema or
migration semantics were changed. Only the Root-owned resource contract
catalog gained `agent-box.skill@1`.

## Tests

The executed Python matrix passed **158 tests**, including Root, Skill plugin,
Harness Skill projection, all five formal offline verticals, runtime
composition, direct-stdio, bwrap, managed tmux, continuation and finalization
coverage. The frontend passed Vitest (6 tests), lint and production build.
`compileall` and `git diff --check` passed. No real model request was made.

## Browser result

Production static assets were served by the Local Web Host and Playwright
completed Skill Library navigation, two explicit preview/confirm imports,
revision/digest display, Quick Launch discovery and two Skill slot selections.
The run waited for `networkidle` and observed no console or page errors:
`PLAYWRIGHT_SKILL_LIBRARY_AND_QUICK_LAUNCH=PASS`.

## Clean-wheel/install

The clean venv installed the Root, Harness, Skills and Web wheels with the
local terminal/runtime wheelhouse. The Harness wheel exposed exactly six
entry points: `harness-profile-store`, `codex`, `claude`, `opencode`, `hermes`
and `pi`; the independent Skills wheel exposed `skills`. All discovered
records were `READY`; `plugins doctor --json` completed with no error status.

## Remaining limitations

P0 is local immutable snapshot storage. Marketplace, remote registries, Git
import, CAS services, Skill consumption evidence, MCP, Memory, Session
portability and Studio are intentionally out of scope.

## READY / NOT READY FOR RESOURCE ROUTING PHASE 2

READY FOR RESOURCE ROUTING PHASE 2
