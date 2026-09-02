# Copy, symlink, sync and projection

| Mechanism | Authority | Drift | Windows/WSL | Human edits | Failure mode |
|---|---|---|---|---|---|
| copy/vendor | target or Git project | upstream drift is explicit | most portable | edits are local | duplicate copies, stale updates |
| symlink/junction | central source | live drift | junction needed on Windows; permissions/policy can reject | edits mutate authority | broken links, escape, cross-device issues |
| one-way sync | source | target can be stale | portable with copy fallback | target edits overwritten or rejected | unclear ownership |
| bidirectional sync | conflict resolver | both can drift | hardest across filesystems | requires journals/locks | lost edits, cycles, partial update |
| overlay | base + writable layer | explicit per layer | runtime support differs | session changes isolated | path/permission surprises |
| CAS + projection | immutable object/ref | no content drift | materialization needed | cannot edit in place | storage/index complexity |
| native profile home | isolated directory | frozen per execution | WSL path and credential boundaries matter | harness sees normal files | incomplete home semantics |

Industry evidence strongly favors one-way installation or links. Bidirectional “sync” is usually marketing shorthand for source-to-target update. A production implementation should declare single-writer, atomic rename, ownership manifest, and fallback behavior rather than infer them from a symlink.
