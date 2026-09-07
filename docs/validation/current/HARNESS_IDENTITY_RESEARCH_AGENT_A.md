# Harness Identity Research — Agent A report (2026-09-05, read-only)

Full findings preserved verbatim in the Goal session log. Executive summary
with the load-bearing facts for admission:

## DeepSeek (`@deepseek-ai/dsh`)
- Installed `dsh` = `@deepseek-ai/dsh@0.1.1-rc.2`, official DeepSeek
  maintainers (imccyu, tianyicui-deepseek@deepseek.com), repository
  github.com/deepseek-ai/deepseek-harness; installed package.json matches the
  registry entry exactly; integrity (0.1.1-rc.2):
  sha512-UP1UIh6q3Gme/yXRn/QL2P8IsVlv8Shpg22TRJIZPsCRWLm4CBiA1MUvXmJAfsOEETBMLAl+xWPtFw6ICsN3wg==
- **Capability gap**: the official ACP profile (`dsh --profile acp`) first
  exists in **0.1.2-rc.1** (npm `latest`, published 2026-09-03; integrity
  sha512-RPq48TzxvwpdT9/7W1tbhZDBMmeK+bxDrX9cqQC27Wx/LqtgJF8PSa3b3xriU8oxtvhwYmk21w2cej3uMQrnVA==).
  0.1.1-rc.2 has only web/headless modes → not sufficient for the program's
  structured ACP admission path.
- **P5 admission decision**: pin exactly `@deepseek-ai/dsh@0.1.2-rc.1`
  (never float latest; record the integrity above at install time).
- Official provider-guide facts (pinned commit d347e703..., providers.md):
  three protocol families (openai-completions/openai-responses/
  anthropropic-messages) exactly one per provider; "Keys are write-only...
  stored in `$DSH_HOME/.credentials.yaml`, while settings retain only its
  credential reference"; model discovery optional. Local corroboration:
  ~/.dsh/settings.yaml holds `apiKeyEnv:` references; ~/.dsh/.credentials.yaml
  0600 (never read by the Goal).
- Session store: append-only JSONL (zstd) per session with crash recovery;
  ACP continuation via `session/list` / `session/resume` against the same
  profile persistence root (resume reconnects MCP declarations, does not
  replay history).

## ZCode
- npm: `zcode-cli@0.0.1` is a third-party reserved-name placeholder (no repo
  provenance, `chat` = "coming soon", 4 files/~3KiB; README admits it aliases
  a nonexistent `glm-cli`). `zcode-app-cli@3.11.2-19` self-describes
  "Unofficial terminal client for the ZCode agent runtime" (community,
  provenance-attested). `@z_ai/zai-cli@0.0.3` is official Z.ai but an atomic
  chat/media/search toolkit — not a coding-session runtime.
- Official product: ZCode Desktop (zcode.z.ai, publisher Z.ai/Zhipu; local
  install 3.10.1 at /mnt/c/Users/maoqh/AppData/Local/Programs/ZCode) which
  provisions a REAL WSL runtime at `~/.zcode/server/zcode-server.cjs`
  (self-identifies 3.10.1) with `agents/glm` + bundled node — the user's
  running `zcode-cli`/`zcode-node-repl-mcp` processes execute from it.
  **These are the user's live sessions — the Goal must never touch them.**
- No officially documented automation/CLI/protocol surface exists (docs index
  has no CLI/headless/protocol section; only MCP integration documented;
  remote-development provisions ~/.zcode/server but exposes no public API).
  No package manifest anywhere under ~/.zcode → identity/integrity cannot be
  established through any official channel.

## Verdicts
- DeepSeek: admissible at the exact pin `@deepseek-ai/dsh@0.1.2-rc.1`.
- ZCode: **COMMUNITY-BRIDGE-ONLY** → per program §10, the seven-Harness Goal
  reports **BLOCKED ON ZCODE IDENTITY** with six-Harness evidence preserved,
  unless the human explicitly approves a community bridge (COMMUNITY/
  EXPERIMENTAL checkpoint) before installation or credential use.
