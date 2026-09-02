# Install, update, pin and rollback

| Model | Reproducibility | Update | Rollback | Multiple versions | Offline/deletion |
|---|---|---|---|---|---|
| copy/vendor | Git/project history if committed | explicit re-copy/update | Git revert or backup | yes if renamed; usually one active slug | works offline after copy; remote deletion does not delete local |
| symlink SSOT | stable while target exists; mutable drift | edit source or sync | backup/source history required | possible in store, usually one target link | works offline; broken link is visible |
| Git registry pull | registry commit in lock where implemented | explicit pull | Git revert or old source copy | source refs can coexist | cached clone works offline |
| package/plugin | package manager version where supported | reinstall/update | package cache/previous version | often yes | depends on cache; uninstall may remove bundled skills |
| CAS/projection | strongest: exact tree digest | create new object/ref | move ref to old digest | first-class | cache remains usable; remote registry outage isolated |
| API Skills | immutable skill versions + default pointer | pointer update | select old version | yes | local client cache behavior UNKNOWN |

Only OpenAI API Skills and Agent-Box's local SkillStore visibly model immutable versions/digests. GitHub CLI, skills.sh and most native managers should not be described as commit-pinned without an explicit version/ref result.
