# Central Skill Repository Pattern Research

Research date: 2026-09-02. Scope: patterns and evidence, not product implementation. Product code was not modified.

## Executive conclusion

The market has converged on a portable folder contract (`SKILL.md` plus supporting files), but not on a central-store contract. The strongest recurring split is: project skills remain in the repository, user skills live in a native global directory, and installation tools either copy/vendor into a target or maintain a local source-of-truth with native links/projections. Immutable CAS and transactionally projected execution are mostly design opportunities rather than established mainstream behavior.

The evidence supports keeping project ownership separate from shared ownership, freezing exact content for an execution, and treating activation as an explicit layer. It does not settle whether Agent-Box should choose copy, symlink, or CAS; those are options for human review.

## Deliverables

- [PROJECT_LANDSCAPE.md](PROJECT_LANDSCAPE.md): identity-checked project inventory.
- [CROSS_HARNESS_COMPATIBILITY_MATRIX.md](CROSS_HARNESS_COMPATIBILITY_MATRIX.md): paths and semantic compatibility.
- [ARCHITECTURE_OPTIONS.md](ARCHITECTURE_OPTIONS.md): four non-binding options.
- [SOURCE_LEDGER.md](SOURCE_LEDGER.md): URLs, locations, dates, versions and evidence grades.
- [EXPERIMENT_LOG.md](EXPERIMENT_LOG.md): safe local checks and prior workspace evidence.

## Review verdict

READY FOR HUMAN CENTRAL SKILL ARCHITECTURE REVIEW. The verdict means the evidence package is discussable, not that a product architecture was selected.

Constraints observed: no credentials read; no model request; no Git write operation; no Agent-Box product code change; writes limited to this directory.
