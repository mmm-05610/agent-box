# ASSESSMENT — Aider (harness id: aider)

Verified 2026-09-02. Probe log: `../experiments/candidates-2.md`. Paths sanitized per SOURCE_POLICY.

## Identity

- Canonical name: **Aider** ("AI pair programming in your terminal"), PyPI package `aider-chat`, binary `aider`.
- Maintainer: **Aider-AI** org (Paul Gauthier; PyPI Owner role: paul-gauthier), repo https://github.com/Aider-AI/aider — license **Apache-2.0** (PyPI classifier; LICENSE.txt in repo).
- Latest: **0.86.2** (PyPI; `aider --version` observed 0.86.2). Repo main at `0.86.3.dev`, **last main commit 2026-05-22** (~3.5 months quiet at verification date) — historically weekly cadence; current cadence UNKNOWN/possibly stalled.
- Requires Python >=3.10,<3.13. Website/docs: aider.chat (docs NOT in the app repo; CNAME at repo root only).

## Admission criteria (8 answers)

1. **Official stable CLI?** YES for identity (org, repo, PyPI, Apache-2.0), with a maintenance caveat: no release since 0.86.2 and main quiet since 2026-05-22. Confidence HIGH on identity, MEDIUM on maintenance status.
2. **Non-interactive launch?** PARTIAL. `aider --message/-m "<msg>"` sends one message, processes the reply, then exits ("disables chat mode"); `--message-file/-f`; `--load <file>` executes /commands from a file on launch; `--exit` performs startup then exits; `--commit` commits pending changes then exits. This is REPL-first tooling with scripted one-shot affordances, not a designed headless mode.
3. **Parseable structured output?** **NO.** Text/markdown to stdout only. No `--json`, `--output-format`, or any machine-readable mode exists in the full argparse surface (verified against args.py and `--help`); `--stream/--no-stream` and `--pretty` only control markdown rendering. This fails the structured-output criterion.
4. **Explicit config/credential/session boundaries?** YES. Config: `.aider.conf.yml` searched cwd → git root → home (main.py:464-477), `-c/--config` override; `.env` via `--env-file`; every flag has an `AIDER_*` env twin. Credentials: provider API keys via env/`.env`/`--set-env`/`--api-key provider=key`; NO OAuth, no credential files managed by aider. Session: `.aider.chat.history.md` + `.aider.input.history` (git root or cwd), `--restore-chat-history`.
5. **Verifiable without reading credentials?** YES. `--version`/`--help` probes with fresh temp HOME; config file names from source.
6. **Clear maintainer + version source?** YES (Aider-AI org; PyPI registry + local --version).
7. **Maps to generic runtime composition?** PARTIAL. spawn+argv+cwd+env works and no pty is strictly required for `-m` runs; BUT (a) zero structured stdout to parse — automation would have to scrape human markdown; (b) git-centric defaults (auto-commits ON, dirty-commits) mutate repo state as a side effect; (c) exit codes for -m runs undocumented.
8. **Full coding harness vs model chat CLI?** Hybrid: a real coding harness (file editing with git snapshots/auto-commits, repo map, lint/test hooks, watch-files AI comments, architect/editor model split, voice, browser GUI) but with NO MCP, NO subagents, NO hooks/plugins/skills surfaces, and no multi-agent orchestration.

## Tier decision: **B**

Identity, launch flags, config layering, credentials shape, and session files are all clear (admission 1/2/4/5/6 pass), but the decisive blocker is admission 3: there is no parseable structured output or event stream, and admission 7/8 gaps (exit codes undocumented, no MCP/extension surfaces) prevent a complete Adapter definition. Admission criteria 3 and 7 fail → **not** recommended for formal support; retained in the knowledge base as a Tier B reference (its YAML-config + env-var projection model and git-snapshot checkpointing remain useful design references).

## Key native facts (condensed)

- One-shot: `aider -m "<msg>"` (reply then exit); `--message-file`; `--load <cmd-file>`; `--exit`; `--commit`; `--dry-run`.
- Confirmation policy: `--yes-always` (scripting doc references `--yes`; full help shows `--yes-always` — naming drift across doc/help, VERSION_SENSITIVE); Python API `InputOutput(yes=True)` is explicitly "not officially supported".
- Config: `.aider.conf.yml` (YAML) cwd → git root → `~/.aider.conf.yml`; `-c/--config`; `--env-file`; `AIDER_<OPTION>` env twins; model settings `.aider.model.settings.yml`; model metadata `.aider.model.metadata.json`; ignore file `.aiderignore` (git root).
- Credentials: OPENAI_API_KEY/ANTHROPIC_API_KEY/... env or `.env`; `--openai-api-base/-type/-version` (some deprecated in favor of `--set-env`); `--api-key PROVIDER=KEY` maps to `<PROVIDER>_API_KEY`; no OAuth/token files.
- Sessions: `.aider.chat.history.md` (markdown), `.aider.input.history` (readline), `--restore-chat-history`, `--llm-history-file`; no JSON session store, no native resume handle beyond history replay (`--load`).
- Git-centric: `--git/--no-git` (default true: look for git repo), `--auto-commits` default True, `--dirty-commits`, `--attribute-*`, `--git-commit-verify`, `--skip-sanity-check-repo`.
- Model routing: `--model`, `--alias ALIAS:MODEL`, `--weak-model`, `--editor-model`, `--reasoning-effort`, `--thinking-tokens`, `--map-tokens/--map-refresh` (repo map), `--check-update/--upgrade`.
- Slash commands verified in source: /commit (commands.py:337), /run (1013), /ask (1182); watch-files ("AI coding comments") flag exists.

## Unresolved

- Exit code semantics for `-m` one-shot runs (undocumented; not probed against a real model by policy).
- Whether any stderr/stdout contract is stable for automation (likely VERSION_SENSITIVE even if it worked).
- Current maintenance status (quiet main since 2026-05-22; next release unknown).
- `--yes` vs `--yes-always` aliasing (doc/help drift).
- aider-install / docker / homebrew distribution channels (not verified this round).
