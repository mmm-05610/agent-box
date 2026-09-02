# Experiments — Candidates (batch 2: gemini-cli, qwen-code, aider)

Date: 2026-09-02. Environment: WSL2 x64 Linux, `<user-home>` workspace `<workspace>`. Read-only probes only; NO model/API calls, NO logins, NO credential contents read, NO global installs. Sanitization: `/home/...` -> `<user-home>`, `/tmp/...` -> `<temp-home>`, repo paths -> `<workspace>`, binary paths -> `<binary>`.

Isolation: all three CLIs installed into disposable `<temp-home>` prefixes (npm `--prefix`, python venv) and executed with a fresh `mktemp` HOME (`<temp-home>`). Official repos shallow-cloned read-only into `<temp-home>/kb2/`.

## gemini-cli

- P1 `command -v gemini` -> NOT ON PATH. NOT_LOCALLY_OBSERVED (installed to isolated prefix instead). (CLI_OBSERVED)
- P2 npm registry latest: @google/gemini-cli 0.58.0, Apache-2.0, bin gemini->bundle/gemini.js, node>=20, maintainers google-wombot/ofrobots/mrdoob. (OFFICIAL_SOURCE)
- P3 `gemini --version` (isolated prefix, fresh temp HOME) -> `0.58.0`, exit 0. (CLI_OBSERVED)
- P4 `gemini --help` -> full option surface: -p/-i/-m/-o text|json|stream-json/-y/--approval-mode default|auto_edit|yolo|plan/--resume/--session-id/--session-file/--list-sessions/--delete-session/--include-directories/--allowed-mcp-server-names/--policy/--admin-policy/--acp/-s/-w/-e/-l/--screen-reader/--raw-output; subcommands mcp/extensions/skills/hooks/gemma. (CLI_OBSERVED)
- P5 `gemini --list-sessions` (temp project dir, temp HOME, unauthenticated) -> auth validation error naming GEMINI_API_KEY / GOOGLE_GENAI_USE_VERTEXAI / GOOGLE_GENAI_USE_GCA; exit 41; NO network traffic possible (validation precedes model call). (CLI_OBSERVED)
- P6 `gemini --output-format bogus` -> yargs choices error, exit 1. (CLI_OBSERVED)
- P7 Before/after diff of temp HOME: `.gemini/{projects.json, projects.json.*.tmp, history/, tmp/}` created; probed workspace left untouched. (CLI_OBSERVED, names only)
- P8 Source read (clone @ 4963a4456, 2026-09-01): output/types.ts JsonOutput + JsonStreamEventType init/message/tool_use/tool_result/error/result (type+timestamp); config.ts full argv parser; settings.ts scopes SystemDefaults<System<User<Workspace + AUTH_ENV_VAR_WHITELIST; storage.ts GEMINI_DIR/.gemini, GEMINI_CLI_HOME, oauth_creds.json/google_accounts.json/mcp-oauth-tokens.json/installation_id/agents/skills/policies dirs. (OFFICIAL_SOURCE)
- P9 Docs read (in-repo official docs): headless.md (JSON schema, NDJSON events, exit codes 0/1/42/53), session-management.md (tmp/<project_hash>/chats/), checkpointing.md (checkpoints dir, --checkpointing flag removed), custom-commands.md (.toml v1 commands user<project), system-prompt.md (GEMINI_SYSTEM_MD), gemini-md.md hierarchy, extensions/reference.md (user/workspace scopes), authentication.mdx (OAuth free tier / GEMINI_API_KEY / Vertex; headless needs API key or Vertex), cli-reference.md (/mcp, /memory reload; statsCommand.ts for /stats). (OFFICIAL_DOC)

## qwen-code

- P1 `command -v qwen` -> NOT ON PATH. NOT_LOCALLY_OBSERVED (isolated prefix). (CLI_OBSERVED)
- P2 npm registry latest: @qwen-code/qwen-code 0.22.3, bin qwen->cli-entry.js, node>=22, SLSA provenance, 8 maintainers; license absent from npm metadata (repo headers carry Apache-2.0, "Copyright 2025 Google LLC, Copyright 2026 Qwen Team"). (OFFICIAL_SOURCE)
- P3 `qwen --version` -> `0.22.3`, exit 0. (CLI_OBSERVED)
- P4 `qwen --help` -> condensed top-level: subcommands auth(REMOVED)/channel/extensions/hooks/mcp/review/serve(Stage 1 experimental --http-bridge)/sessions/update; flags -m/-p/-i/--safe-mode/-s/-o text|json|stream-json/-c/--continue/-r/--resume/--fallback-model. NOTE: many real options hidden (source-verified). (CLI_OBSERVED)
- P5 `qwen --approval-mode bogus` (temp project, temp HOME, stdin /dev/null) -> validation error "Choices: plan, default, auto-edit, auto, yolo", exit 1; no auth/network touched. (CLI_OBSERVED)
- P6 Source read (clone @ 165a03596, 2026-09-02 == 0.22.3): config.ts approval normalization (auto_edit/autoedit aliases; hidden -y/--yolo + mutual exclusion), --input-format stream-json rules (requires stream-json out; incompatible --json-schema "first structured_output call ends the session"); nonInteractive/io/{BaseJsonOutputAdapter,JsonOutputAdapter,StreamJsonOutputAdapter}.ts wire events assistant/user/system/result + control_request/control_response(can_use_tool); `-o json` = one JSON array frame of all messages incl. result{is_error,result,usage,stats,summary}; auth-type.ts AuthType openai|qwen-oauth|gemini|vertex-ai|anthropic; modelConfigErrors.ts default env keys OPENAI/ANTHROPIC/GEMINI/GOOGLE; qwenOAuth2.ts device-code flow vs chat.qwen.ai; storage.ts QWEN_DIR/.qwen, QWEN_HOME, oauth_creds.json, chats/<sessionId>.runtime.json, global tmp/debug. (OFFICIAL_SOURCE)
- P7 Docs read (in-repo): features/headless.md (-p, budgets --max-session-turns/--max-wall-time/--max-tool-calls, goal_state stream_event), features/sub-agents.md (.qwen/agents/ project > ~/.qwen/agents/ user; fork subagents; .qwen/fork-profiles/ <=64KiB), configuration/auth.md (DASHSCOPE_API_KEY, settings.json envKey, auth command removed), configuration/trusted-folders.md, common-workflow.md (QWEN.md + @ refs). (OFFICIAL_DOC)
- P8 README (WebFetch): QwenLM org, Apache-2.0, originally based on Google Gemini CLI v0.8.2, upstream sync stopped from v0.1; brew install qwen-code; SubAgents/Agent Teams/Workflows; multi-protocol providers. (OFFICIAL_SOURCE)

## aider

- P1 `command -v aider` -> NOT ON PATH. NOT_LOCALLY_OBSERVED (venv). (CLI_OBSERVED)
- P2 PyPI registry: aider-chat 0.86.2, Apache-2.0 classifier, requires_python >=3.10,<3.13, Owner paul-gauthier, project URL github.com/Aider-AI/aider. (OFFICIAL_SOURCE)
- P3 `aider --version` (isolated venv, fresh temp HOME) -> `aider 0.86.2`, exit 0. (CLI_OBSERVED)
- P4 `aider --help` -> full argparse surface; flags incl. --message/--msg/-m, --message-file/-f, --load, --exit, --apply, --commit, --dry-run, --yes-always, --watch-files, --auto-commits/--no-auto-commits, --git/--no-git, --aiderignore, --map-tokens/--map-refresh, -c CONFIG_FILE, --env-file, AIDER_* env twins shown per flag. NO --json/--output-format/--output-style or any machine-readable output mode exists. (CLI_OBSERVED)
- P5 Source read (clone @ 5dc9490bb, last main commit 2026-05-22): main.py:464-477 config search cwd->git root->home .aider.conf.yml; args.py --input-history-file/.aider.input.history + --chat-history-file/.aider.chat.history.md (git root or cwd), --model-metadata-file .aider.model.metadata.json, --model-settings-file .aider.model.settings.yml, --aiderignore, --exit "startup then exit", -m "process reply then exit (disables chat mode)", --load "execute /commands from a file"; commands.py cmd_commit:337 / cmd_run:1013 / cmd_ask:1182; HISTORY.md top release 0.86.1 (PyPI 0.86.2). (OFFICIAL_SOURCE)
- P6 Docs (WebFetch): aider.chat/docs/scripting.html (-m one-shot, --message-file, --yes, --no-auto-commits, --dry-run, --commit; Python API "not officially supported"; no JSON mode) + docs/config.html (.aider.conf.yml home/git-root, AIDER_ env vars, .env). (OFFICIAL_DOC)
- P7 No model requests made; one-shot exit codes NOT probed (would require a real model call) -> unresolved.
