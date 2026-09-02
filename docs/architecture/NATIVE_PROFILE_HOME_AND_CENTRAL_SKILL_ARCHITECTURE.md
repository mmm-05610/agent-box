# Native Profile Home + Central Skill Installation — Architecture

Status: implemented (2026-09-02).  This is the canonical architecture note;
historical Phase 1 Agent Skill projection semantics remain archived and are
not authoritative.

## 1. The authority model

```
Remote/Git/Local source
→ Central SkillStore (agent-box-skills: immutable revisions, digest, CAS)
→ EXPLICIT install-to-Profile (agent-box-harnesses installer, transactional)
→ Profile Native Home (the ONE persistent native environment per Profile)
→ Harness native discovery (no per-execution SkillRef)
```

- A Profile owns exactly **one complete, persistent, authoritative Native
  Home** (`profiles/<harness>/<profile>/native-home/`).  It is the guest
  HOME content the Harness sees at runtime.
- The Central SkillStore is the canonical authority for shared Skill
  content.  Central Skills are **not** scanned by any Harness directly; they
  become available to a Harness only after an explicit install into a
  Profile.
- Project Skills stay in the Workspace/Git worktree (their own authority);
  they are discovered through each Harness's native project roots and are
  never auto-copied to the Central Store or auto-installed into a Profile.
- `SkillRef` is a **management/install identity** (library identity, exact
  revision, install/update/rollback, provenance).  Ordinary Executions carry
  **no** `agent-box.skill@1` input: `ProfileRef` → installed skills,
  `WorkspaceRef` → project skills.

## 2. Profile storage model (vNext)

```
profiles/<harness_type>/<profile_id>/
├── native-home/               唯一活动原生环境（guest HOME 内容）
├── profile.json               THE ONE current pointer（唯一可见性 authority）
├── installed-skills.json      Agent-Box 管理的安装 receipts 索引
├── revisions/<revision>/      不可变 envelope 历史（不影响 current）
├── transactions/              统一 journal + mutation lease + active markers
└── recovery/                  execution view 恢复目录
```

Rules: `native-home/` is the only active environment; `profile.json` is the
ONLY current pointer — reads without an explicit revision resolve through
it and NEVER scan the max revision directory; orphan/uncommitted revisions
are invisible to `get()/list()`; a broken pointer fails closed typed
(`PROFILE_POINTER_NOT_FOUND` / `PROFILE_POINTER_INVALID`) and legacy
envelope-only migration is an explicit, provenance-marked operation.
No symlink escape; safe permissions (0o700); exact revision/digest
resolution preserved; explicit config edits, skill mutations and harness
runtime state are distinguished (§3); unknown safe files are preserved;
confirmed credential paths never enter snapshots/digests/logs and are never
read; symlink/socket/device/lock are handled by typed policy.

## 3. Revision / native-state semantics

- Explicit profile config edit → new Profile revision (managed config
  rendered into the native home).
- Skill install/update/rollback/uninstall → new Profile revision (the
  envelope identity now binds the `skill_receipts_digest`).
- Session/cache/checkpoint evolution → **no** Profile revision; only the
  plugin-local **native state generation** advances.
- Old revisions are rolled back explicitly; a revision snapshot is never a
  second mutable native home; configuration rollback and runtime/session
  rollback are distinguished and never falsely equated.

## 4. Execution Native Home View

```
Exact ProfileRef → ONE lease-held critical section (the freeze):
  acquire mutation lease → no pending journal → freeze pointer
  (revision + native generation) → policy-aware safe copy (credentials/
  ephemeral excluded, unknown safe files preserved, symlinks rejected) →
  base manifest → declared ephemeral overlays → register active marker →
  release lease
→ mount at /runtime/home (rw)
→ Harness runs
→ reconcile as ONE lease-held journaled transaction: decision →
  copy-back (backup + staged proof) → PERSISTENT home tree digest →
  generation CAS → pointer commit, then cleanup (idempotent; never deletes
  the profile home)
```

Correctness never depends on reflink/overlayfs; copy is the product
semantics.  The pointer's `native_tree_digest` always equals the persistent
home digest — ephemeral overlays never pollute it.  A failed/ambiguous run
never writes uncertain content back: the view is preserved under
`recovery/` with a typed status for a human decision.  Mutations acquire
the SAME lease FIRST and check active executions inside it — prepare and
mutation cannot interleave (no TOCTOU).  `finish()` is only legal on a
terminal process/session (typed `FINISH_NOT_TERMINAL` otherwise; no
fabricated terminal, no reconcile/discard while running).

## 5. Skill installation

`ProfileSkillInstallation` receipts (profile identity, central SkillRef,
installed tree digest, native target, managed file inventory, state,
timestamp, provenance) are stored at `installed-skills.json` and bound into
the Profile revision.  States: `INSTALLED` (persisted) plus computed
`UPDATE_AVAILABLE` / `DRIFTED` / `DISABLED` / `CONFLICTED`.

The transaction chain (unified with every other Profile mutation): lease
first → no-pending + active checks inside the lease → re-CAS → resolve exact
SkillRef → validate content/inventory against the central digest → validate
harness compatibility → compute native target → preview conflicts → STAGED →
APPLIED (files with backup + receipts snapshot/update) → REVISION_WRITTEN +
POINTER_COMMITTED (the visibility commit) → COMMITTED → cleanup.  Default
copy; no script execution; no unmanaged/Profile-local clobber; one mutation
writer per Profile; one managed installation per native target; one revision
per skill per Profile; central revisions never auto-propagate.

Rollback is complete: files, previous receipt (or absence), pointer/
revision and receipts digest are all restored from the journal
(`receipts.before.json` + staged/backup replay).  Recovery never treats
files+receipts+old revision as committed: it verifies pointer/envelope/
receipt digests before completing, and never deletes a file it cannot
prove the transaction created (`RESTORE_MANIFEST_UNVERIFIABLE` →
`RECOVERY_REQUIRED`).  Corrupt journals fail closed.

Drift: a manually modified managed skill reports `DRIFTED`, blocking
auto update/uninstall; the typed dispositions (restore central revision,
keep as Profile-local, promote to central) are available at the backend.

## 6. EffectiveSkillInventory

Launch-time facts derived from two authorities: the Profile (central-
installed + profile-local skills) and the Workspace (project skills).
Bounded and credential-free; claims are only `AVAILABLE` /
`DISCOVERABLE` / `PROJECTED` — never `CONSUMED` without real evidence.  It
carries no host absolute private paths and no credentials, and is safe for
Web read-only display and diagnostics.

## 7. Plugin ownership

- **agent-box-skills**: Central SkillStore, SkillRef/revision/digest,
  import/update, content validation, Resource Library.  Never imports
  harnesses/Profile/web/runtime.
- **agent-box-harnesses**: Profile Native Home, NativeHomePolicy (the only
  path authority), skill targets, install/update/remove, profile-local
  inventory, EffectiveSkillInventory, execution views, project projection
  decisions.  Consumes a typed Skill content port; never defines Skill
  content authority.
- **Web/Application**: selects central Skill + target Profile, calls
  preview/confirm; never writes native files directly; discovers everything
  through the generic Catalog.
- **Root**: extension kernel + generic contracts/refs + generic
  host/runtime/credential protocol packs.  Zero Work Core/schema/migrations
  changes; `PLUGIN_API_VERSION` stays 2.
- **Work Core**: zero semantic changes (ontology, Binding, Freeze, Dispatch,
  Finalization, schema, migrations untouched).

## 8. Migration

- **1.x full directory**: read-only preview → confirm through the SAME
  journaled transaction as every other mutation (lease, no-pending, active
  check, CAS, preview-digest re-verification — all before any write; full
  rollback on failure).  Original directory never deleted; existing files
  are never overwritten.  All public surfaces (preview, provenance,
  diagnostics) are host-path-free: source identity is a bounded content
  fingerprint plus a one-shot server-side token.
- **Envelope-only profile**: EXPLICIT `migrate_envelope_only()` seeds a
  minimum, correct native config rendered by the Harness owner, marked
  `MIGRATED_FROM_ENVELOPE`; never claims to restore files that never
  existed; the legacy max-revision scan is only ever used here, once, as
  documented migration input.

## 9. Transactional atomicity boundary (honest)

Single-file state (profile.json pointer, installed-skills.json, envelopes,
journals) uses atomic rename — that is the ONLY visibility commit point.
Cross-directory multi-file changes (native config patch, skill files,
legacy import, reconcile copy-back) are journaled transactions with
deterministic staged+backup replay and forced crash recovery — they are NOT
directory-level atomic swaps, by design (provable rollback, no cross-FS
dependency).

Crash-window closure (2026-09-02): every journal declares its FULL commit
intent BEFORE the pointer replacement (`proposed_pointer` snapshot); crash
recovery derives COMPLETE_COMMIT / ROLLBACK_TO_PREVIOUS / RECOVERY_REQUIRED
from intent + the ACTUAL pointer and never from the step list.  A fulfilled
pointer commit is never rolled back from an exception handler.  Execution
prepare freezes the exact resolved revision+digest inside the mutation
lease (typed `PROFILE_FREEZE_*` mismatch otherwise).  See
`docs/validation/current/NATIVE_PROFILE_TRANSACTION_CRASH_WINDOW_CLOSURE.md`.
Final durability closure (2026-09-02): terminal transitions are governed by
a strict authority (COMMITTED only from POINTER_COMMITTED; recovery-confirmed
POINTER_COMMITTED is appended explicitly before COMMITTED); committed
mutations surface as success or a typed ``CommittedMutationError``, never as
ordinary failures; every persistence write (journal/envelope/pointer/
receipts/lease/marker) uses the shared fsync-based durable primitive —
power-loss durable on local POSIX filesystems honoring fsync, explicitly
degraded to process-crash-only where directory fsync is unavailable;
terminal transaction artifacts are bounded by retention pruning.  See
``docs/validation/current/NATIVE_PROFILE_TRANSACTION_FINAL_DURABILITY_CLOSURE.md``.

## 10. Inventory bounds

Project Skill derivation enforces hard limits (`MAX_PROJECT_SKILL_
DIRECTORIES/FILES/DEPTH/FILE_BYTES/TOTAL_BYTES`, public entry/field caps,
git timeout).  Over-limit → `OVER_LIMIT`, symlink/special → `UNSUPPORTED`,
git failure → `UNKNOWN` — never a pretend-reproducible digest and never a
false "clean" (see code comments for the values and their rationale).

## 11. Deferred (not implemented this round)

MCP Resource; remote Marketplace; object-level CAS/GC; dependency resolver;
publisher/signature; Skill script execution; automatic central↔project sync;
automatic project import; automatic install of all central skills to all
Profiles; automatic upgrade; one-shot Execution Skill override; logical
Session; cross-Harness continuation; a second persistent runtime-state
native home; ACP for Codex/Claude/Hermes/Pi; Work Core changes.
