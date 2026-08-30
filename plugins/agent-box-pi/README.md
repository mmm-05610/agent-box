# agent-box-pi

Third-party Agent-Box plugin that registers one accountable Pi
`ExecutionProvider` for **DeepSeek-powered parallel research**:

- provider id `pi` — display name **Pi / DeepSeek**;
- launches the official Pi coding agent (`@earendil-works/pi-coding-agent`,
  pinned exact version) as a real interactive TUI inside an **exact tmux
  pane** the user already owns (`agent-box-tmux.pane@1`);
- supports up to four independent Executions concurrently — one Pi process
  per pane, one Core Execution per Dispatch, one native Pi SessionRef each;
- supports fresh SessionRefs and continuations; observe / recover / explicit
  finish are provider-owned controls surfaced through WorkBoard.

Install into the same Python environment as Agent-Box:

```bash
python -m pip install -e ./plugins/agent-box-tmux
python -m pip install -e ./plugins/agent-box-pi
agent-box plugins list --json
```

The plugin registers the `agent-box-pi.continuation@1` Contract and the
`pi-session` resource provider.  WorkBoard discovers the `pi` execution
control adapter (`attach`/`observe`/`recover`/`finish`) and the optional
`pi-session` continuation input adapter through entry points.

## Pi & DeepSeek configuration (plugin-owned, not a Binding)

Long-term Pi/DeepSeek settings live in
`$AGENT_BOX_HOME/plugins/pi/config.json`:

```json
{
  "binary": "/absolute/path/to/pi",
  "provider": "deepseek",
  "model": "deepseek/deepseek-v4-flash",
  "thinking": "high",
  "version": "0.84.3",
  "update_policy": "pinned",
  "agent_dir": "$AGENT_BOX_HOME/plugins/pi/agent",
  "session_root": "$AGENT_BOX_HOME/plugins/pi/sessions",
  "evidence_root": "$AGENT_BOX_HOME/plugins/pi/evidence"
}
```

- `provider` is fixed to `deepseek`; only current catalog ids
  (`deepseek/deepseek-v4-flash`, `deepseek/deepseek-v4-pro`) are accepted.
- `version` is pinned and verified against `pi --version` at first start.
- `binary` must be `pi` (resolved via PATH) or an absolute path.
- **No secret may appear in this file.**  The credential is only ever
  referenced as `DEEPSEEK_API_KEY` from the launching environment, or Pi's own
  auth source inside the plugin-owned `agent_dir` (e.g. `/login`).  The
  provider never writes, copies, or persists an API key.

## Execution semantics

`pi` accepts one Workspace, one or more Prompt fragments, one exact tmux pane,
and an optional Pi continuation.  `start()`:

1. verifies the exact pane,
2. launches `pi` in that pane (cwd = workspace) through the tmux plugin,
3. uses the configured DeepSeek model and thinking level,
4. auto-injects every PromptFragment as the initial prompt,
5. persists a provider-owned start record under `evidence/`,
6. returns the native session id as the provider correlation.

A completed turn, an idle TUI, or even a dead pane never closes the Core
Execution — only the explicit WorkBoard **Finish** submits it.  `finish()`
collects the native SessionRef, the session JSONL event range/transcript
digest, tmux scrollback, and runtime facts.  A continuation always creates a
**new Core Execution** that resumes the old native Pi session; its frozen
model must match the pinned DeepSeek model.

## Evidence

- `evidence/<dispatch>.start.json` — launch correlation (no secrets);
- `evidence/<dispatch>.tmux.txt` — bounded pane scrollback;
- session JSONL (plugin-owned session root) — native transcript reference;
- native `SessionRef` for the Pi session + tmux pane identity refs.

## Boundaries

No Agent-Box agent type/profile, no Work Core / migration changes, no generic
harness abstractions, and no secret material in Refs, evidence, or tests.

## Evidence ceiling

Pi session and tmux facts are provider projections, not independent consumption verification.

## What this plugin cannot prove

It cannot prove all resources were used or that a run was fully isolated, secure, or attested.
