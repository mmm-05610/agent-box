# agent-box-pi

Third-party/example Pi (DeepSeek) Harness adapter. The Pi profile is the
authority for executable, model, provider, native home, skills/MCP/instructions
and credential locator. The credential locator is metadata only.

The ExecutionProvider emits a typed `HarnessCommandSpec` and requires exactly
one frozen `RuntimeHostRef`, `SandboxRef`, and `TerminalSessionRef`. Runtime
Composition performs the only start: bwrap may wrap the command and the chosen
TerminalSession may run it in direct-stdio or PTY mode. This plugin never calls
tmux, bwrap, `Popen`, a shell, or a host process API.

Pi-native files are projected as typed sources: `Workspace`, `pi-profile-home`,
`pi-executable`, `helper`, `pi-instructions`, and `pi-mcp`. Skills use Pi's
`--skill-dir`, MCP uses `--mcp-config`, and instructions use
`--system-prompt`. A continuation carries only a native SessionRef and always
starts a new Core Execution.
