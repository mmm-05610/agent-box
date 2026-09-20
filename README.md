# control/ — the single current scheduling and decision record

This directory is a **dedicated Git repository** that holds only non-secret
scheduling and decision text. It replaces the old `docs/implementation/` authority
in `agent-box-server-round1`, which is now **retired history**.

## What is in force

| File | Holds |
| --- | --- |
| [current-state.md](current-state.md) | what the product can do today, in three separate layers: implemented / integrated / user-tryable |
| [decisions.md](decisions.md) | the decisions currently in force, which ones replaced which, and what is unresolved |
| [backlog.md](backlog.md) | unfinished work, its source, dependency and the gap that blocks it |
| [workspaces.md](workspaces.md) | each preserved repository / worktree: purpose, owner status, how to restore it |
| [environments.md](environments.md) | known services, version sources, ports, data-root references, whether they may be touched |
| [migration-log.md](migration-log.md) | every move / archive / retirement performed by the cleanup and its verification result |

## Rules of use

1. **One writer per fact.** If you change a fact in one file, do not restate it
   in another; link to it. `current-state.md` describes, `decisions.md` authorises,
   `backlog.md` schedules; none of them may contradict another.
2. **`decisions.md` is append-only in substance.** To overturn a decision, add a
   new numbered entry that names the entry it replaces
   (`supersedes: D-0007`). Do not rewrite or delete the old entry.
3. **Never resolve a conflict by timestamp.** If two records disagree, keep both
   and mark the disagreement. `decisions.md` §"Unresolved" is where those go.
4. **This control directory does not inherit the old machinery.** It does not
   carry the `incremental-work-order` skill's mandatory polling loop, and it does
   not carry any previous session's writer identity. The old scheduler's loop
   stopped with its session; nothing here restarts it.
5. **No dispatch while no executor is appointed.** `backlog.md` is a record, not
   a queue. `I` appoints executors before anything is dispatched.
6. **No secrets.** This repository is a Git repository. Never record credential
   contents, tokens or key material here — only file paths, permission bits and
   the fact that a locator exists. `environments.md` documents credential
   *locators* only.

## Relationship to the archive

The full history of the old regime — its 81 numbered rulings, its 156 order
definitions, its daily polling ledger, its acceptance windows — is preserved
verbatim under [../archive/legacy-scheduling/](../archive/legacy-scheduling/)
with its provenance. This directory holds the *distilled present*, not a copy of
that history. Where this directory cites something, it cites it by id and points
at the archive rather than quoting thousands of lines.

## The one thing that must be asked about

Whether the product is usable by the user is a **user decision**. Nothing in
this directory may promote "the code is finished" into "the user can use it", and
no agent may write a user-acceptance verdict here.
