# Architecture options for human review

## A — Central copy/vendor

Authority: central store for shared skills, Git for project skills. Layout: `store/skills/<id>/<revision>` plus copied native targets. Identity: source + slug; revision/digest required. Project skills stay in place; global installs copy. Activation selects exact refs. Conflicts are explicit project-over-global or error. Updates create snapshots; rollback selects old revision. Offline works after install. Projection is copy into native homes. Trust is import-time preview, bounded tree, no script execution. Windows/WSL is simplest. Migration from 1.x imports snapshots. Complexity: low implementation, medium operations. Failure: duplicate drift and unclear manual edits. Reversible: remove projections and keep projects untouched.

## B — Central directory + symlink/sync

Authority: central editable source. Layout: central tree plus target links/junctions, copy fallback only when declared. Identity: source slug; optional digest. Project remains local unless explicitly imported. Activation toggles links/profile map. Conflicts block rather than overwrite. Updates are live; rollback requires backups/history. Offline works if links resolve. Trust requires symlink containment and target ownership. Windows/WSL is medium/high complexity. Migration imports then links. Implementation medium, operations high. Failure: broken links, permission differences, accidental central mutation, bidirectional sync ambiguity. Reversible by unlinking targets.

## C — Immutable CAS + runtime projection

Authority: CAS objects and signed/ref metadata. Layout: `objects/<digest>`, refs, manifests. Identity: namespaced source ID + tree digest. Project refs record repo/path/commit/tree digest; dirty trees require explicit non-reproducible marker. Activation selects exact ref/profile. Conflicts are namespaced or project-priority with diagnostics. Updates add objects; rollback changes ref. Offline is first-class. Projection uses isolated native homes/overlay and receipts. Trust verifies digest/provenance/signature; scripts require execution policy. Windows/WSL needs materialization rather than links. Migration imports existing snapshots. Implementation high, operations medium/high. Failure: GC/ref corruption/projector mismatch. Reversible via old refs and retained objects.

## D — Native Profile Home + Central Store + project skills in place + runtime overlay

Authority: central store for shared skills, project Git for local skills, profile manifest for activation. Layout: central immutable-ish snapshots; per-execution native home overlay combines selected global and project refs. Identity/revision/digest as C. Project is never copied automatically. Activation is profile/agent/harness specific; collisions are a planning error unless a policy names the winner. Update/rollback never changes an active execution; new sessions resolve new refs. Offline uses local store. Trust is split between project and central source; no real HOME or credentials are copied. Windows/WSL uses copy/junction only inside isolated home. Migration from 1.x can project existing native dirs, then adopt gradually. Implementation high, operational complexity medium. Failure: overlay path mismatch, incomplete native home, stale session manifest. Reversible by disabling overlay and using native paths.

Human decision is required; this document does not select an option.
