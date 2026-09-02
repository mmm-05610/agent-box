# Open questions (maximum eight)

1. Is Agent-Box authority a mutable central source, immutable revision store, or profile manifest over both?
2. Must project refs be reproducible on dirty/ignored worktrees, and what user-visible exception is acceptable?
3. Is symlink/junction a supported optimization or a forbidden default with copy materialization?
4. Should project-over-global be universal, or should same-name collision require explicit policy?
5. Which harness capabilities justify per-target metadata/overrides beyond standard frontmatter?
6. What trust boundary applies to scripts: import, activation, or each execution?
7. Does the first release need multi-version coexistence and rollback, or only immutable snapshots?
8. Which responsibilities belong in Root versus skills plugin, projector, workspace provider, and future registry?
