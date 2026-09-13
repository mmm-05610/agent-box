# Work Order 38 verification log

## Research isolation

- Owned temporary root: `/tmp/agentbox-harness-selection-38.otEluD`
- Owner marker: `.agentbox-owner`, exact content
  `agentbox-work-order-38-research`
- Candidate checkouts: one directory per fixed repository under `checkouts/`
- Isolated home and log roots: `homes/` and `logs/`
- Baseline check: `git merge-base --is-ancestor 67c6b40 HEAD`, exit `0`
- Initial worktree: clean on `feature/server-http-codex-r1`

The root contains public third-party source and generated dependency trees only.
Experiments clear inherited provider/token/auth variables, set controlled HOME
and XDG roots, and do not issue login or model calls. It will be removed after
the committed evidence no longer depends on ephemeral files.

Stage B commands and results will be added here.

