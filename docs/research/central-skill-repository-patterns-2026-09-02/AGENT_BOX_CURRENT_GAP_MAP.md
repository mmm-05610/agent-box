# Agent-Box current capability and gap map (read-only audit)

## Present

- `plugins/agent-box-skills`: plugin-owned `SkillStore`, `SkillSelector`, library contribution.
- Store snapshots contain `SKILL.md`, supporting files, metadata, revision and `sha256` tree digest.
- Exact `SkillRef` resolution and `ResolvedAgentSkill.source` keep public identity separate from private projection source.
- Import validates UTF-8/frontmatter, bounds file count/size/depth, rejects symlinks and reference escapes, and writes revisions/index with atomic rename.
- `expected_revision` provides optimistic conflict detection; old revisions remain available; disable creates a new disabled revision.
- Quick Launch selects immutable SkillRefs; preview/confirm import and Resource Library are exposed by the web plugin layer.
- Harness adapters consume a private source port and materialize execution-scoped native targets; current adjacent research covers Codex/Claude/OpenCode/Hermes/Pi.
- Profile revisions, projection manifests, hidden credential values and execution receipts are established patterns.

## Declared but not consumed / incomplete for this research

There is no remote registry identity, Git commit pin for project skills, publisher signature, license policy, dependency graph, multi-version activation profile, central-to-project promotion protocol, or formal ProjectSkillRef. Native-home completeness and cross-Harness skill target behavior remain adapter-specific. Symlink semantics and Windows junction behavior are not a central product contract.

## Alignment and overreach

Alignment: immutable revisions, digests, exact refs, bounded imports, fail-closed projection, project ownership separation, and execution-scoped projection match stronger external patterns. Potential over-design: treating local snapshot revisions as a registry/package ecosystem before authority, trust, and update policy are decided; storing every global/project concern in Root; assuming one canonical format implies activation/runtime compatibility.

## Ownership boundaries for discussion

Root: exact binding/ref and trust decision only. Skills plugin: store, import, validation, provenance, revisions. Harness projector: native paths, profiles, overlays, collision/ownership checks. Project/workspace provider: Git/worktree/submodule/dirty state and project trust. Remote registry phase: search, publisher, signed metadata, package distribution, revocation.

No product code was modified.
