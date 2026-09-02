# evidence.md — OpenCode (opencode)

Research date: 2026-09-02. Binary under test: opencode 1.18.21 (npm global).
Source citations `SRC:` refer to a read-only shallow clone of
**github.com/sst/opencode** at `/tmp` (HEAD 5341a5e442679f96fe152aac91c31509f4dd5430,
2026-09-01; `packages/opencode` version 1.18.25); file:line paths are relative to
repo root. `/tmp/oc-probe-R6J9` in raw transcripts is sanitized as `<temp-home>`.
No model/API calls, no credential contents read; real `~/.config/opencode` and
`~/.local/share/opencode` only name-listed.

Source kinds: OFFICIAL_DOC | OFFICIAL_SOURCE | CLI_OBSERVED | RELEASE_NOTE |
PEER_PROJECT | INFERENCE.

## Identity & distribution

| id | claim | source | kind | ver | conf | stability |
|---|---|---|---|---|---|---|
| A1 | version 1.18.21 | `opencode --version` transcript (experiments E1) | CLI_OBSERVED | 1.18.21 | HIGH | VERSION_SENSITIVE |
| A2 | official repo = sst/opencode TS monorepo; packages/opencode 1.18.25 | https://github.com/sst/opencode (clone HEAD 5341a5e, 2026-09-01); SRC packages/opencode/package.json:4 | OFFICIAL_SOURCE | 1.18.25 | HIGH | STABLE |
| A3 | opencode-ai/opencode archived → became Charmbracelet Crush; old core was Go; current core+TUI are TS | https://github.com/opencode-ai/opencode README.md:1-9 ("Archived: Project has Moved … Crush"); SRC packages/tui/package.json:3-4 | OFFICIAL_DOC | — | HIGH | STABLE |
| A4 | install channels: npm/curl/brew/scoop/choco/pacman/AUR/deb/rpm/AppImage/desktop | https://github.com/sst/opencode README.md:54-81 | OFFICIAL_DOC | 1.18.x | HIGH | STABLE |
| A5 | npm package ships standalone ELF (Bun-compiled) | `file` on `<user-home>/.npm-global/lib/node_modules/opencode-ai/bin/opencode.exe` (E1) | CLI_OBSERVED | 1.18.21 | HIGH | STABLE |
| A6 | docs at opencode.ai/docs; schema at https://opencode.ai/config.json | SRC built-in skill body (debug skill output); https://opencode.ai/docs/config/ | OFFICIAL_DOC | 1.18.x | HIGH | STABLE |
| A8 | cadence: 1.18.21 installed vs 1.18.25 repo next day | A1 + A2 arithmetic | INFERENCE | — | HIGH | VERSION_SENSITIVE |

## Executable discovery

| id | claim | source | kind | ver | conf | stability |
|---|---|---|---|---|---|---|
| B1 | npm-global path + symlink layout | E1 transcript | CLI_OBSERVED | 1.18.21 | HIGH | STABLE per-install |
| B2 | upgrade binary cache at XDG cache `opencode/bin`; `Global.Path.bin` | SRC packages/core/src/global.ts:22,41; cli/cmd/upgrade.ts | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| B4 | `OPENCODE_TEST_HOME` overrides homedir for Global.Path.home | SRC packages/core/src/global.ts:19 | OFFICIAL_SOURCE | 1.18.25 | MEDIUM | VERSION_SENSITIVE |

## Launch modes

| id | claim | source | kind | ver | conf | stability |
|---|---|---|---|---|---|---|
| C1 | TUI default cmd + flags (project positional, model/continue/session/fork/prompt/agent/auto/mini/replay, port/hostname/mdns/cors) | `opencode --help` transcript (E2) | CLI_OBSERVED | 1.18.21 | HIGH | VERSION_SENSITIVE |
| C2 | run flags full list; --format default/json; --file ≤10MiB; --attach + basic auth; --auto aliases yolo/dangerously-skip-permissions | `opencode run --help` (E3); SRC packages/opencode/src/cli/cmd/run.ts:247-274, 304-305, 364-382 | CLI_OBSERVED + OFFICIAL_SOURCE | 1.18.21/25 | HIGH | VERSION_SENSITIVE |
| C2b | headless default: permission.asked auto-REJECTED with warning; --auto replies "once" | SRC run.ts:796-830 | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| C3 | serve flags + endpoints /doc, /event, /global/event | `opencode serve --help` (E2); SRC httpapi/server.ts:190, httpapi/middleware/compression.ts:11, httpapi/public.ts:155 | CLI_OBSERVED + OFFICIAL_SOURCE | 1.18.21/25 | HIGH | VERSION_SENSITIVE |
| C4 | attach cmd + flags | `opencode attach --help` (E2) | CLI_OBSERVED | 1.18.21 | HIGH | VERSION_SENSITIVE |
| C5 | acp cmd exists (Agent Client Protocol) | `opencode acp --help` (E2); SRC cli/cmd/acp.ts | CLI_OBSERVED + OFFICIAL_SOURCE | 1.18.21/25 | HIGH | VERSION_SENSITIVE |
| C7 | providers list/login/logout (alias auth) | `opencode providers --help` etc. (E2); SRC cli/cmd/providers.ts | CLI_OBSERVED | 1.18.21 | HIGH | VERSION_SENSITIVE |
| C8 | models cmd from models.dev cache; --refresh/--verbose | `opencode models --help`; SRC cli/cmd/models.ts:3,23 | CLI_OBSERVED + OFFICIAL_SOURCE | 1.18.21/25 | HIGH | VERSION_SENSITIVE |
| C9 | run exits on session.status idle; exitCode 1 on errors | SRC run.ts:5-13, 796-800, 837-873 | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| C9b | no-creds run: banner `> build · big-pickle`, no fast-fail, blocked ≥25s (timeout kill 124) | E5 transcript | CLI_OBSERVED | 1.18.21 | HIGH (single trial) | VERSION_SENSITIVE |
| C10 | network surface: local HTTP, models.dev, share service, remote MCP, instruction URLs (5s timeout) | SRC instruction.ts:95-103; models.ts; share module; serve flags | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |

## Profile & configuration

| id | claim | source | kind | ver | conf | stability |
|---|---|---|---|---|---|---|
| D1 | path table (data/cache/config/state/tmp/bin/log/repos) + auto-mkdir | E4 transcript; SRC global.ts:10-43 | CLI_OBSERVED + OFFICIAL_SOURCE | 1.18.21/25 | HIGH | STABLE |
| D2 | global load order config.json→opencode.json→opencode.jsonc; TOML legacy migration | SRC packages/opencode/src/config/config.ts:262-296 | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| D3 | auto-seed global config `{"$schema":...}` when missing; probe produced opencode.jsonc + .gitignore | E4a; SRC config.ts:262-267 | CLI_OBSERVED + OFFICIAL_SOURCE | 1.18.21/25 | HIGH | VERSION_SENSITIVE |
| D4 | project files up-walk cwd→worktree, deepest wins; .opencode dirs incl. ~/.opencode | SRC packages/opencode/src/config/paths.ts:10-42; config.ts:431-445 | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| D5 | full merge order incl. remote .well-known, managed /etc/opencode etc., MDM highest | https://opencode.ai/docs/config/ | OFFICIAL_DOC | 1.18.x | MEDIUM-HIGH | VERSION_SENSITIVE |
| D6 | env escapes OPENCODE_DISABLE_PROJECT_CONFIG / OPENCODE_CONFIG / OPENCODE_CONFIG_CONTENT / OPENCODE_CONFIG_DIR | SRC config.ts:81-88, 415-433; built-in skill body | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| D7 | unknown top-level keys rejected; config not hot-reloaded | built-in skill `customize-opencode` body (E4c) | OFFICIAL_SOURCE (in-binary skill) | 1.18.21 | HIGH | VERSION_SENSITIVE |
| D8 | config field list (model/small_model/share/autoupdate/skills/references/agent/command/mcp/plugin/permission/formatter/lsp/experimental/tool_output/compaction/...) | E4c skill body; SRC packages/core/src/v1/config/*.ts | OFFICIAL_SOURCE | 1.18.21/25 | HIGH | VERSION_SENSITIVE |
| D10 | username defaults to OS user | E4b `opencode debug config` | CLI_OBSERVED | 1.18.21 | HIGH | STABLE |

## Credentials

| id | claim | source | kind | ver | conf | stability |
|---|---|---|---|---|---|---|
| E1 | auth.json at Global data dir, mode 0600 | SRC packages/opencode/src/auth/index.ts:10, 74-76 | OFFICIAL_SOURCE | 1.18.25 | HIGH | STABLE |
| E2 | auth.json value shapes: api{key,metadata?} / oauth{refresh,access,expires,accountId?,enterpriseUrl?} / wellknown{key,token} | SRC auth/index.ts:14-30 | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| E3 | OPENCODE_AUTH_CONTENT env replaces file | SRC auth/index.ts:60-65 | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| E4 | real install has auth.json (existence only; contents never read) | `ls <user-home>/.local/share/opencode` (E6) | CLI_OBSERVED | 1.18.21 | HIGH | STABLE |
| E6 | {env:VAR}/{file:path} interpolation in config strings | E4c skill body | OFFICIAL_SOURCE | 1.18.21 | HIGH | VERSION_SENSITIVE |

## State isolation

| id | claim | source | kind | ver | conf | stability |
|---|---|---|---|---|---|---|
| F2 | SQLite opencode.db(+wal/shm) at data dir; channel-suffixed name; OPENCODE_DB override incl. :memory: | E4a; SRC packages/core/src/database/database.ts:44-60 | CLI_OBSERVED + OFFICIAL_SOURCE | 1.18.21/25 | HIGH | VERSION_SENSITIVE |
| F3 | legacy JSON layout (storage/session/{info,message,part}, project, session_diff) still migrated-from | SRC packages/opencode/src/storage/storage.ts:64-224 | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| F4 | session list/export/import/db CLI verbs | `opencode session/export/import/db --help` (E2) | CLI_OBSERVED | 1.18.21 | HIGH | VERSION_SENSITIVE |
| F5 | plans dir .opencode/plans (VCS) else data dir | SRC packages/opencode/src/session/session.ts:327-332 | OFFICIAL_SOURCE | 1.18.25 | MEDIUM | VERSION_SENSITIVE |
| F7 | fixed shared tmp /tmp/opencode; locks with heartbeat/meta.json | E4/E4a; SRC global.ts:15,33 | CLI_OBSERVED + OFFICIAL_SOURCE | 1.18.21/25 | HIGH | VERSION_SENSITIVE |
| F10 | env flag list | SRC packages/core/src/flag/flag.ts:21-64; E4c skill body | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |

## Resource surfaces

| id | claim | source | kind | ver | conf | stability |
|---|---|---|---|---|---|---|
| G1 | instructions: AGENTS.md/CLAUDE.md/CONTEXT.md walk-up (first type wins), global config AGENTS.md + ~/.claude/CLAUDE.md, instructions[] globs+URLs, nested attach on read | SRC packages/opencode/src/session/instruction.ts:60-152, 179-221 | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| G2 | skills supported: .opencode/skill(s)/**/SKILL.md, global, external ~/.claude/skills + ~/.agents/skills, skills.paths/urls, name rules (≤64 lowercase-hyphen, folder match), description required to surface; built-in customize-opencode | E4c `opencode debug skill`; SRC packages/opencode/src/skill/index.ts:17-44 | CLI_OBSERVED + OFFICIAL_SOURCE | 1.18.21/25 | HIGH | VERSION_SENSITIVE (recent) |
| G3 | mcp config shape (local command[]/environment, remote url/headers, enabled, {env:} interpolation) + mcp add/list/auth/logout/debug | E4c skill body; `opencode mcp --help` (E2); SRC core/src/v1/config/mcp.ts | CLI_OBSERVED + OFFICIAL_SOURCE | 1.18.21/25 | HIGH | VERSION_SENSITIVE |
| G4 | commands: .opencode/command(s)/*.md frontmatter + template body, $ARGUMENTS, $1..; config command{}; run --command | E4c skill body; `opencode run --help --command` (E3) | OFFICIAL_SOURCE + CLI_OBSERVED | 1.18.21/25 | HIGH | VERSION_SENSITIVE |
| G5 | permission keys list; pattern objects last-match-wins; external_directory path globs; per-agent override | E4c skill body; SRC core/src/v1/config/permission.ts | OFFICIAL_SOURCE | 1.18.21/25 | HIGH | VERSION_SENSITIVE |
| G6 | agents: frontmatter fields (name/model/variant/description/mode/hidden/color/steps/options/permission/disable/temperature/top_p), built-ins build/plan/general/explore + hidden compaction/title/summary; agent create/list/debug | E4c skill body; E4d `opencode debug agent build`; `opencode agent create --help` | CLI_OBSERVED + OFFICIAL_SOURCE | 1.18.21/25 | HIGH | VERSION_SENSITIVE |
| G7 | plugins: auto-discovery .opencode/plugin(s)/*.{ts,js}; config plugin[] (npm spec, file URL, [name,opts]); hook list; --pure/OPENCODE_PURE | E4c skill body; `opencode plugin --help` | OFFICIAL_SOURCE + CLI_OBSERVED | 1.18.21/25 | HIGH | VERSION_SENSITIVE |
| G7b | global config dir doubles as npm root for plugins (package.json, node_modules observed) | E6 `ls <user-home>/.config/opencode` | CLI_OBSERVED | 1.18.21 | HIGH | STABLE |
| G9 | references (local dirs / git repos as @ context) | E4c skill body | OFFICIAL_SOURCE | 1.18.21 | MEDIUM-HIGH | VERSION_SENSITIVE (new) |
| G11 | modes: config.mode{} present; docs mention modes/ subdir | E4b; https://opencode.ai/docs/config/ | CLI_OBSERVED + OFFICIAL_DOC | 1.18.21 | MEDIUM | VERSION_SENSITIVE |
| G12 | tui.json global TUI settings | https://opencode.ai/docs/config/ | OFFICIAL_DOC | 1.18.x | MEDIUM | VERSION_SENSITIVE |

## Events & observation

| id | claim | source | kind | ver | conf | stability |
|---|---|---|---|---|---|---|
| H1 | run --format json streams raw JSON events | SRC run.ts:13 comment + help text (E3) | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| H2 | headless loop consumes session.status(idle)/session.error/permission.asked | SRC run.ts:780-830 | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| H3 | bus event names (session created/updated/deleted/diff/error; message updated/removed; part updated/delta/removed; todo; compaction; model-switched; agent-switched) | SRC packages/opencode/src/session/{session.ts:323-330, message-v2.ts:55-61, status.ts:11, todo.ts:14, compaction.ts:26}; SDK types list | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| H4 | part types: text/reasoning/file/tool/step-start/step-finish/snapshot/patch/agent/subtask/retry/compaction | SRC packages/sdk/js/src/v2/gen/types.gen.ts:378-617 | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| H5 | usage/cost tracked; stats CLI | SRC session.ts getUsage:334+; `opencode stats --help` | OFFICIAL_SOURCE + CLI_OBSERVED | 1.18.21/25 | MEDIUM-HIGH | VERSION_SENSITIVE |
| H6 | log file data/log/opencode.log; --print-logs; --log-level | E4a; `opencode --help` | CLI_OBSERVED | 1.18.21 | HIGH | STABLE |
| H7 | SSE /event + /global/event; websocket tracker | SRC compression.ts:11; public.ts:155; websocket-tracker.ts | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE (live not observed) |
| H9 | db CLI: path / sql / --format json|tsv | `opencode db --help` (E2) | CLI_OBSERVED | 1.18.21 | HIGH | VERSION_SENSITIVE |

## Runtime control

| id | claim | source | kind | ver | conf | stability |
|---|---|---|---|---|---|---|
| I1 | POST /session/:id/abort | SRC httpapi/groups/session.ts:91, 253-278 | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| I2 | prompt + prompt_async endpoints (steer/queue) | SRC groups/session.ts:95-96 | OFFICIAL_SOURCE | 1.18.25 | MEDIUM-HIGH | VERSION_SENSITIVE |
| I3 | permission reply once/always/reject; GET /permission | SRC groups/permission.ts:11-30; permission/index.ts:121-163 | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| I4 | question list/reply endpoints | SRC groups/question.ts:11-36 | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| I5 | resume flags -c/-s/--fork across TUI/run/attach | E2/E3 help transcripts | CLI_OBSERVED | 1.18.21 | HIGH | VERSION_SENSITIVE |
| I6 | model-switched/agent-switched events exist | SDK v2 types list | OFFICIAL_SOURCE | 1.18.25 | MEDIUM | VERSION_SENSITIVE |
| I7 | revert/unrevert/summarize/share/unshare/delete message/part/update part endpoints | SRC groups/session.ts:85-104, 279-311, 369+ | OFFICIAL_SOURCE | 1.18.25 | HIGH | VERSION_SENSITIVE |
| I9 | run --port pins ephemeral server port | E3 help text | CLI_OBSERVED | 1.18.21 | HIGH | VERSION_SENSITIVE |

## Third-party boundary

- Anything not on opencode.ai/docs, github.com/sst/opencode, or the binary
  itself is NOT official (e.g. community plugin registries, wrapper CLIs,
  "opencode" forks). No third-party wrappers were used in this research.
