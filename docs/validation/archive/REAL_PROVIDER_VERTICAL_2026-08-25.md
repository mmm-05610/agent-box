# Real Provider Vertical Validation — 2026-08-25
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Status: **END-TO-END VERIFIED**

This validation exercised the production Work Core input-dispatch path with
three real ResourceProviders and the Codex App Server interactive
ExecutionProvider. The fixture runtime was ephemeral; only non-secret native
identities and digests are recorded here.

## Verified path

1. Create Work and Execution.
2. Resolve a mutable Git selector to an exact commit before Dispatch.
3. Freeze WorkspaceRef, prompt ArtifactRef, and Agent-Box ProfileRef with one
   `inputs_digest`.
4. Materialize a detached Git worktree and verify actual HEAD.
5. Verify the prompt artifact digest and the non-secret profile configuration
   digest.
6. Project the Codex profile and workspace through the existing bwrap launch
   plan.
7. Start a real Codex App Server thread and turn.
8. Observe the Execution as ACTIVE after the turn completed.
9. Explicitly Finish the provider responsibility window.
10. Record SessionRef, RunRef, event artifact digest, output commit, and output
    tree; then make the Execution terminal.

## Native identities and exact pins

- Work: `work_423c844254984427af0daa99cae982d0`
- Execution: `exec_60c68a60b2c34fc5923239fa7e4e776d`
- Dispatch: `dispatch_d585dcf3f16e4f5bbe68ba61000d1894`
- Inputs digest: `affe5b3ba852874393b5d150e5c45ad426fc5c2ed7ef755d909cfa8b84267633`
- Git input commit: `5c5db90331615dd23caee898feeca80d7cef3dab`
- Codex thread: `01a03885-4c51-7fa1-a8fb-79c5d67cff69`
- Codex turn: `01a03885-4c74-72c1-989f-69ad8458fe05`
- Git output commit: `4204b69e71099987ab135467407e8c3e117c92e2`
- Git output tree: `cc5fc9c816198d694bfef4327109c039ac770d0f`
- App Server event artifact: `sha256:53f91946f05b5514651c49bc36c658b3b2329b6bd49a3cf863e853556d1d6051`
- Final Core projection: `terminal / succeeded`

## Real limitations discovered

- A workspace below `/tmp` is hidden by the current Codex bwrap policy because
  that policy mounts a tmpfs on `/tmp`. Managed worktrees must therefore be
  materialized on a path visible under the selected runtime policy.
- Codex native `workspaceWrite` protects Git internals and prevented the Author
  from creating the output commit. The working configuration uses the existing
  outer bwrap projection as the runtime boundary and declares
  `externalSandbox` to App Server. This is partial local isolation, not a
  high-assurance sandbox.
- Agent-Box project-profile projection creates untracked runtime configuration
  in the worktree. The output commit and tracked tree were clean and exact, but
  the whole workspace remained dirty due to that projected surface. Submit
  evidence must distinguish projected runtime files from product output; it
  must not claim the entire filesystem was clean.
- `projected` resource state is provider observation. It proves projection at
  the provider boundary, not that the model semantically consumed every
  resource.
- The ProfileRef digest excludes credential contents and mutable session/log
  stores. It pins non-secret launch configuration, while credential availability
  remains a separate, weaker runtime fact.

## Reproduction

Run:

```bash
python3 spikes/real_provider_vertical/run.py
```

The runner copies only the minimum credential-bearing profile files into an
ephemeral project-owned runtime directory and removes that directory on exit.
It does not write secrets or full transcripts into this document.
