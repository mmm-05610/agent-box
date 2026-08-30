# Web Product Loop and TUI Retirement — validation
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

## Verdict

COMPLETE for the controlled Preview product loop.

## Evidence

`tests/test_web_product_loop.py::test_browser_e1_e2_product_loop` starts a
real loopback Host, a temporary Git repository, the real `agent-box-git`
plugin, and a controlled fake ExecutionProvider. Playwright drives the actual
production page through Work creation, E1 binding/review/freeze, Finish and
FINALIZING polling, output inspection, “Use as input in new execution”, E2
freeze/launch, and explicit Work completion.

The test asserts Core facts, not only page text: E1/E2 are distinct
Executions; the E1 output WorkspaceRef identity is the E2 input identity; Git
creates distinct worktrees; W2 HEAD/tree equals the captured C1/T1; and E1 is
not completed by finalization. It does not run a preview script, construct a
Ref, create a worktree manually, or access SQLite directly.

Browser artifact: `/tmp/agent-box-web-e1-e2.png`.

## Host operations

Finish operations are Host-owned atomic JSON records under
`AGENT_BOX_HOME/host/operations`. They have bounded states and progress, use a
client operation/idempotency key, are submitted at most once per Host, and are
serialized per Execution. On restart, `accepted`/`running` becomes
`interrupted`; no external effect is replayed automatically. Core's
FinalizationReceipt remains the terminal authority.

## Retirement gate

The capability ledger marks every required management capability `WEB VERIFIED`
or intentionally removed. WorkBoard, `src/agent_box/tui`, its entry points and
adapters, Textual, and the PyWebView/data bridge are removed. Codex, tmux and
Pi Harness plugins remain; their native terminal processes are outside the
browser. Browser terminal, remote access, scheduler, and new providers remain
out of scope.

Native Codex E2E was not run in this controlled-provider validation and remains
the next rehearsal step.
