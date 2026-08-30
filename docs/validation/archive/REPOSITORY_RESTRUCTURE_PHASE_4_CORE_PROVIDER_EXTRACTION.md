# Repository Restructure Phase 4 — Core Provider Extraction
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

## Final verdict

COMPLETE. Work Core concrete provider ownership was extracted without Core
ontology/schema/semantic changes. Native Codex/model execution was not run.

## Ownership result

`work_core` now contains only provider-neutral contracts/protocols, Registry,
dispatch, persistence, finalization, evidence/observation, and Core models.
The former `work_core/providers/resources.py` and empty providers package were
removed. No Git command/worktree, filesystem artifact authority, Profile
repository/layout/digest, or Codex/tmux/Web knowledge remains under Core.

- Git authority: `agent-box-git`, provider `git-workspace`.
- Profile authority: `agent-box-harnesses`, provider `codex-profile`.
- Artifact authority: new `agent-box-artifacts`, provider `artifact-file`.

Artifact identity remains `agent-box.prompt-fragment@1` with SHA-256 exact file
identity, file URI validation, immutable local text resolve, and selector id
`responsibility`. The former `agent-box-preview-resources` package was removed;
no forwarding package or duplicate registration remains.

## Registry audit

No Registry change was required. It has only provider-neutral contract type
validation, descriptor/provider registration, duplicate detection, and typed
lookup. It has no Profile, Git, Artifact, Codex, tmux, or Web branches and does
not construct concrete providers.

## Browser failure closure

The Profile failure was a formal UI async/routing race: the API returned 201,
but the form had no pending lock and the test asserted revision text after an
arbitrary delay. The Continuation failure was the same UI lifecycle class:
there was no pending/error state, and the old modal could remain observable
until navigation completed. Neither was an API contract mismatch or stale
static bundle. Freshly built JS/CSS were served with HTTP 200, and diagnostic
traces reported no `.wb-error`, console error, or page error.

Profile now disables mutation while pending, prevents duplicate submission,
shows bounded errors, and navigates to the created profile detail only after a
successful response. Continuation has the same pending/error behavior, clears
the old modal on success, then navigates to the new Execution binding. It does
not dispatch the new Execution automatically; E1 remains terminal.

Browser tests now use semantic URL, modal, heading, and revision waits rather
than fixed sleeps for mutation completion. They collect method/URL/status,
route/hash, bounded visible errors, console errors, and page errors without
logging request bodies or credential values.

Final formal browser result:

```text
test_browser_e1_e2_product_loop                  1 passed
test_browser_harness_profile_binding_vertical    1 passed
2 passed in 11.74s
```

The run used the freshly generated `src/agent_box_web/_static` tree after
`npm run build`, including the current JS/CSS assets.

## Tests and packaging

- Frontend `npm run test:run`: 6 passed.
- Frontend `npm run lint`: passed with existing duplicate-i18n/unused-import
  warnings.
- Frontend `npm run build`: passed.
- Focused Web/Core/plugin regression: 60 passed.
- Full prior Python regression baseline: 327 passed, 1 skipped.
- Formal browser tests: 2 passed, not skipped.
- Root-only wheel/import/discovery/doctor validation: passed.
- Root, Web, Harnesses, Git, tmux, and Artifacts wheels: built.
- Clean wheel root contains no Web or Core concrete provider files.
- Clean discovery contains exactly one `artifact-file` and no
  `preview-resources`.
- `git diff --check`: passed.

## Legacy retained and Phase 5 boundary

Intentionally retained for later phases: `src/agent_box/work/`,
`src/agent_box/resources/profile.py`, `resources/sessions.py`,
`src/agent_box/launch.py`, legacy CLI/REPL, old database tables, and 1.x
read-only import sources. Historical Refs remain historical facts and are not
made resolvable through removed Core providers.

No Work Core files were changed for browser closure. Existing unrelated dirty
changes were preserved. Phase 5 legacy experience migration may begin.
