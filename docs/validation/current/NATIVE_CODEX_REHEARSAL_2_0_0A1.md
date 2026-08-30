# Native Codex rehearsal — 2.0.0a1

Date: 2026-08-30
Verdict: **blocked — do not publish the developer preview**

## Scope

This rehearsal used the formal Web Host/Application path with the official
Git, tmux, artifacts, and harnesses plugins. It created a temporary clean Git
repository, materialized an execution-scoped detached workspace, froze an
exact Codex profile Ref, launched the native `codex` binary in a real tmux
console, and observed the execution through the Host API.

The profile used the non-secret credential locator
`codex-login/default`. No credential value was read or written by the
rehearsal.

## Results

- `codex --version`: `codex-cli 0.149.0`
- `codex login status`: logged in using ChatGPT
- Binding review: passed
- Dispatch freeze: `accepted`
- Native tmux launch: started
- Native model-directory request: completed
- Fixed work objective: **not completed**
- First attempt: timed out after 120 seconds without creating the required
  `native-rehearsal.txt`
- Second attempt with the default model: timed out after 90 seconds without
  creating the required file
- No release tag, commit, push, GitHub Release, or PyPI publication was made

## Interpretation

The control-plane and launch path reached the native Codex process, but this
run does not prove that a real Codex turn can complete a governed workspace
change and produce final evidence. The exact cause remains unresolved; the
rehearsal is therefore not promoted to a pass based on startup or model-list
activity alone.

Offline fake-provider, browser, plugin, and packaging checks remain valid as
offline evidence. They do not substitute for this native gate.

## Required before retry

1. Diagnose why the native interactive turn does not submit or complete under
   the managed tmux launch.
2. Repeat the same fixed-objective rehearsal and verify the file contents,
   detached-workspace cleanliness, finish operation, and captured evidence.
3. Only after that pass may the 2.0.0a1 GitHub-only developer preview release
   gates be reconsidered.

## Attempt 3 — App Server provider after bounded safety fix

Attempt 3 used the formal `codex-app-server` provider instead of the tmux
interactive provider. The responsibility was explicit and minimal: create
`native-rehearsal.txt` in the current workspace with exactly
`Agent-Box 2.0 native rehearsal` followed by one newline, then reread it.

脱敏 lifecycle evidence:

- execution: `exec_5f2fa96f77414d2e8c01b380f3928c19`
- workspace cwd: execution-owned detached worktree under the temporary
  managed worktree root
- profile: revision 1 with an exact `sha256:` ProfileRef digest
- protocol: `initialize`, `thread/start`, `turn/start`, and
  `turn/completed` were observed
- native identity: non-empty thread ID and turn ID were returned
- native items: two `fileChange` items targeted the execution worktree and
  both ended with status `failed`
- terminal turn status: `completed`
- expected file: absent after the turn
- Git status: clean; HEAD/tree remained the frozen base
- explicit Finish: operation `succeeded` before the safety fix, but this was
  a false-positive path caused by empty-diff capture and is not accepted as a
  valid rehearsal result

## Attempt 3 conclusion

The provider/Host chain now proves the distinction between a completed turn
and a completed workspace responsibility. It records redacted lifecycle
diagnostics and rejects both failed native file changes and empty Git output.
However, the native Codex attempt still did not produce the required file.
The remaining classification is **model completed without required action /
native file-change application failure**; the redacted App Server event
surface does not expose a more specific error code. No fourth attempt was
made.

Final verdict for this blocker: **C. NATIVE INTEGRATION STILL BROKEN**.

## Direct `~/.codex` diagnostic attempt

At the user's request, one additional bounded diagnostic used the real
`~/.codex` directory directly as `CODEX_HOME`, while retaining the temporary
Git worktree and formal Web Host/App Server path. This was not treated as a
release attempt or a pass.

- execution: `exec_122b9fb5a70c41b9b6d9de70c524416c`
- profile: temporary revision 1, exact digest, workspace-write
- credential/config home: direct `~/.codex`
- result: App Server `initialize` timed out
- thread/turn: none returned
- target file: absent
- Git worktree: unchanged
- classification: **profile/config projection incompatibility**

This confirms that directly pointing the formal provider at the complete
personal Codex home is not a safe fix: it loses the execution-scoped config
boundary and did not provide a responsive App Server handshake. No further
Native attempts were made.

## Alpha release status

Native Codex is an official experimental plugin and is not a Work Core Alpha
release gate. The real workspace-mutation rehearsal remains unverified after
an environment interruption. Offline protocol and plugin tests pass. This
document does not claim Native Codex workspace mutation succeeded.

The local App Server schema audit found that the provider must send
`approvalPolicy: "never"` on `turn/start`, include the exact detached worktree
in `runtimeWorkspaceRoots`, and include it in
`sandboxPolicy.writableRoots`. Those provider changes and the Git empty-diff
guard are covered by offline tests. No further real Native request is planned
for the Alpha release.
