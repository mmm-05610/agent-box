# 42-D Provider/Model preparation (no-model)

Date: 2026-09-14. This is preparation evidence only; no provider endpoint was contacted and no
real model request was made.

The validation entrypoint now emits a sanitized `PREPARED` record in `--dry-run` mode. It fixes
the native configuration surfaces and keeps the acceptance bounds explicit: two prompt requests,
64 output tokens per response, one continuation, isolated HOME/XDG/HERMES_HOME, per-process
deadlines, and process-group cleanup. Credentials are represented only as an environment reference
and are not written to generated configuration or evidence.

| Harness | Installed component | Prepared native configuration | Status |
| --- | --- | --- | --- |
| Pi | `@automatalabs/pi-acp` 0.5.0 | isolated `PI_CODING_AGENT_DIR/models.json` and `settings.json`; user-confirmed `deepseek-flash`; non-thinking body; output 64; agent/provider retries disabled | PREPARED; MODEL_NOT_VERIFIED |
| Hermes | `hermes-agent` 0.19.0 | isolated `$HERMES_HOME/config.yaml`; explicit official provider/model; non-thinking `extra_body`; output 64; one application attempt and SDK retry disabled natively | PREPARED; MODEL_NOT_VERIFIED |
| OpenCode | `opencode-ai` 1.18.21 | isolated `$XDG_CONFIG_HOME/opencode/opencode.json`; OpenAI-compatible provider; user-confirmed `deepseek-flash`; non-thinking model option; output 64 | PREPARED; MODEL_NOT_VERIFIED |

Pi and Hermes are bounded to exactly one provider attempt per prompt (two attempts per Harness).
OpenCode 1.18.21 has a fixed native transient-error retry ceiling of five retries, so its paid-test
budget is conservatively accounted as at most six provider attempts per prompt, twelve total; the
90-second process deadline is an additional wall-clock cap. A failed attempt may consume input
tokens even if it produces no output, so the coordinator must reserve against this 12-attempt
ceiling before starting OpenCode.

The accepted model identifier is the user-confirmed `deepseek-flash`, consistent with the retained
earlier acceptance evidence. The public 2026-09-14 DeepSeek price page no longer lists that exact
identifier, so preparation does not falsely assign a public SKU price to it. Before paid execution,
the coordinator must conservatively reserve at least the current official peak Flash tariff ceiling
(CNY 3.0/million cache-miss input and CNY 9.0/million output) and stop if the account/API exposes a
higher tariff. Source checked: `https://api-docs.deepseek.com/zh-cn/quick_start/pricing/`. All three
configurations request non-thinking mode. This preparation does not debit the ledger.

Independent local evidence uses `fake_acp_peer.mjs` and verifies initialize, two prompts, terminal
responses, and reopening via `session/load`. It does not claim native provider or model support.

Commands:

```text
node --check scripts/server-round1/model-validation-42d.mjs
node --test scripts/server-round1/model-validation-42d.test.mjs
```

Results: syntax check passed; 4 tests passed, 0 failed. The test suite uses only a temporary fake
token and local fake ACP; it does not read any user credential, login state, or credential
environment variable, and performs no network I/O.

Remaining handoff: production full-chain injection of the authorized secret through the existing
Windows/Worker protected locator, plus the real per-Harness model gate, remains outside this
no-model preparation task. The earlier Codex `wire_api="chat"` failure was subsequently reclassified
as an incorrect configuration after DeepSeek's official Responses setup was supplied; it is not
evidence of protocol incompatibility.
