# Project-local skills

Project-local skills remain the dominant ownership model because they follow branch/worktree, are reviewable in Git, and can encode project trust. Costs are duplication, merge noise, and accidental exposure to every agent in the checkout. Central stores should therefore index project skills without silently copying/adopting them; import should be explicit.

| Case | Safe policy for comparison | Industry evidence |
|---|---|---|
| clean tracked skill | identity = repo origin + relative path + commit/tree digest | Agent Harness lock; Git workflow |
| dirty worktree | freeze tree digest plus dirty marker, or reject for reproducible execution | no common standard; UNKNOWN |
| ignored skill | do not silently promote; require explicit trust/import | safer than auto-adopt; skill-manager does auto-adopt, a counterexample |
| submodule | record submodule commit and relative path | Git identity needed; not generally handled by native harness |
| monorepo | walk from cwd to worktree; nearest project root wins | OpenCode explicitly walks to git worktree; Agent Harness supports targets |
| worktree | use actual worktree root and branch state, never main checkout implicitly | project precedence is common |
| same name as global | project wins or hard conflict diagnostic; preserve both refs | Gemini/Copilot/OpenCode favor higher project precedence |
| script-bearing skill | trust project/repo separately from model activation; consent before execution | Gemini documents install and activation consent |

Proposed `ProjectSkillRef` fields for discussion: `repo_identity`, `worktree_root`, `relative_path`, `git_commit`, `tree_digest`, `dirty`, `ignored`, `submodule_commits`, and `trust_decision`. This is a proposal, not a product change.
