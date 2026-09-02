# Safe experiment log

All experiments were constrained to `/tmp` or existing repository source; no real HOME, credentials, model request, or skill script was used.

| Date | Command/source | Observation | Conclusion | Tier |
|---|---|---|---|---|
| 2026-09-02 | `pwd`, branch, HEAD, status, `git diff --check` | dirty worktree with unrelated harness changes; no diff-check output | preserve baseline; write only target directory | A |
| 2026-09-02 | read `plugins/agent-box-skills/src/.../store.py` | bounded snapshot, revision/digest, atomic rename, symlink/traversal rejection | local CAS-like snapshot, not central registry | A |
| 2026-09-02 | read `tests/test_skill_store.py` | replay stable; expected revision conflict; old revision retained; disable fail-closed | rollback/version behavior is locally tested | A |
| 2026-09-02 | official Gemini/OpenCode/Hermes docs | install/link/uninstall, precedence, namespaced plugins, activation consent | activation and path semantics are vendor-specific | B |
| 2026-09-02 | official `gh skill` and skills.sh docs | GitHub-source install/update and npx install | registry/install, not immutable central CAS | B |
| 2026-09-02 | official Codeg/Agent Harness docs | symlink/junction SSOT; canonical source + rendered outputs | B and D patterns are real | B/C |

No `--help` probe was run against installed harnesses in this turn because existing adjacent research already contains isolated CLI results and the request forbids real credentials/model calls. Unknown fields remain unknown rather than inferred.
