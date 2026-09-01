# Agent-Box bwrap Sandbox Plugin

`agent-box-sandbox-bwrap` registers the `bwrap-sandbox` ResourceProvider for
the Root-owned `agent-box.sandbox@1` contract. A frozen SandboxRef is resolved
through the ExtensionRegistry to a `ResolvedBwrapSandbox` policy wrapper.

The public runtime boundary is one operation:

```python
capabilities = resolved_sandbox.negotiate(requirements)
spec = resolved_sandbox.wrap(mount_plan, harness_command_spec, attempt_key=attempt_key)
```

The Host/Harness assembler must prepare runtime bundles, configuration, and
digests first. `MountPlan` contains only prepared sources, canonical guest
targets, `ro`/`rw` access, and tmpfs targets. The provider validates provenance,
digest, authorization scope, path policy, environment, cwd, and capabilities,
then translates the plan to a deny-by-default bwrap argv. It never resolves or
interprets ResourceRefs, Harness names, Profile,
Skill, MCP, or model semantics, and it never claims LOADED or CONSUMED.

The implementation retains native probing, network-none policy, clearenv,
`--die-with-parent`, shell-free argv compilation, opaque wrapper leases,
mount/path/symlink/digest checks, bounded environment, wrapper observation, and
idempotent cleanup. `wrap` never calls `Popen` and never creates a target.
TerminalSession/RuntimeHost owns the single subsequent `run` operation.
