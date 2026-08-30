# Verdict

**READY FOR MANUAL COMMIT**

The repository has a recovery snapshot and an exact-path staging script, but
this environment cannot write `.git/index.lock` (`Read-only file system`). No
commit, push, tag, reset, checkout, restore, or clean operation was performed.
Before committing, run the script in a terminal with a writable Git index,
review the cached diff, and resolve the skipped browser gate.

# Branch and original HEAD

- Branch: `spike/real-governed-binding`
- Original HEAD: `e340f3b89d85c13d63fe8fc962cb2126177000c2`
- Commit hash: not created; Git index was read-only.

# Recovery snapshot

`/tmp/agent-box-recovery-20260830-7I2P1s.tar.gz`

The snapshot excludes `.git`, virtual environments, dependencies, build and
distribution output, egg-info, caches, databases, local homes, logs, runtime
trees, credentials, and other requested local/private classes.

# Included paths

The exact allowlist and classification are recorded in
`docs/plans/RESTRUCTURE_CHECKPOINT_STAGING_LEDGER.md`. It covers the formal
Core, extensions, resource contracts, application/server, migrations 003 and
005–009, CLI changes, six approved plugin distributions, formal frontend and
approved retirements, tests, and current restructure documents. Approved
deletions are included by the manual script as individual paths.

# Excluded paths

Generated/runtime/cache/private paths, `acs`, `report-source.md`, workboard
residue, `spikes/`, experimental/deferred `e2e/`, preview scripts, prototypes,
legacy unrelated source/tests, and unclear historical documents are excluded
or marked `REVIEW_REQUIRED` in the ledger. No generated asset or local
credential path was staged.

# Secret audit

- Filename checks found only expected auth/template names and UI words such as
  `AuthInput`; no confirmed secret file was selected for inclusion.
- Content scan found no confirmed API key, Bearer token, or private key in the
  formal checkpoint candidates; matching file names/values were not printed.
- `src/agent_box/templates/hermes/.env` is an empty placeholder fixture and
  remains excluded.
- No external-credential symlink is included.
- Cached secret scan: no staged files existed because staging was blocked.

# Tests

- Compileall (`.venv/bin/python -m compileall -q src plugins tests`): passed.
- Core/extension/Host tests: `113 passed`.
- Official plugin tests: `61 passed`.
- Frontend dependency install: passed (`npm ci`).
- Frontend tests: `6 passed`.
- Frontend production build: passed.
- Browser E1→E2 tests: `2 skipped`; browser gate not executed in this
  environment.

# Staged diff summary

- `git diff --cached --name-status`: empty.
- `git diff --cached --stat`: empty.
- `git diff --cached --check`: passed vacuously.
- First exact staging probe (`git add -- .gitignore`) failed because Git
  could not create `.git/index.lock`.

# Commit hash

None. The intended local command, after manual staging review, is:

```text
git commit -m "chore: checkpoint preview architecture before repository restructure"
```

# Remaining unstaged changes

All working-tree changes remain unstaged, including the formal checkpoint
source, approved deletions, documentation, generated ledger/report, unrelated
changes, and deferred review paths. The `acs` submodule remains untouched.

# Safe to start repository restructure?

Safe to prepare manually from the recovery snapshot, but do not treat the
checkpoint as committed until the exact-path script succeeds, the cached
diff/secret review passes, and the browser E1→E2 gate is run successfully.
