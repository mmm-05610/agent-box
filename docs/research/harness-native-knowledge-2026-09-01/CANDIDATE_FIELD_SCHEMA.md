# CANDIDATE_FIELD_SCHEMA — candidate.toml 约定

`candidate.toml` 是**研究候选**，不是生产 `harnesses.toml` 的副本。
禁止直接复制进正式 Registry；正式采纳必须经 FILL_AND_MODIFICATION_PLAN.md 的
人工裁决流程。

## 设计原则

1. **可解析**：每个 candidate.toml 必须通过 `python3 -c "import tomllib; tomllib.load(...)"`。
2. **未知显式化**：未知值写字符串 `"unknown"`，不得用 `false` 冒充 unsupported；
   未验证写 `"unverified"`。
3. **四类事实分离**：每个小节内的键按下列前缀或子表区分——
   - `declared_*`：官方文档声明（OFFICIAL_DOC / OFFICIAL_SOURCE）；
   - `observed_*`：本机或隔离实验观察到（CLI_OBSERVED）；
   - `inferred_*`：推断（INFERENCE）；
   - `[unresolved]`：所有未能验证的问题清单。
4. `[meta]` 必须携带 tier、验证日期、来源清单与 CLI 版本。

## 节结构（必选 harness 完整版）

```toml
[meta]
harness_id = "codex"
tier = "A"                      # A | B | C
verified_version = "0.152.0"
verified_on = "2026-09-01"      # CLI_OBSERVED 日期
research_files = ["FACTS.md", "evidence.md"]
sources = [                     # 主来源清单（URL 或 repo#path）
  "https://github.com/openai/codex",
  "developers.openai.com/codex",
]

[identity]          # A
canonical_id = "codex"
aliases = ["codex-cli"]
display_name = "Codex"
upstream_org = "OpenAI"
repository = "https://github.com/openai/codex"
license = "Apache-2.0"

[distribution]      # A
packages = ["npm:@openai/codex", "brew:codex"]
binary_names = ["codex"]
maintenance_status = "active"

[platform]          # B
linux = "supported"
wsl = "supported"
windows = "unknown"
macos = "supported"

[executable]        # B
identity = "codex"
layout = "observed: npm wrapper launching native rust binary"
version_probe = ["--version"]
version_output_format = "codex-cli <semver>"

[launch_modes.exec]        # C —— 每个 mode 一个子表
argv = ["codex", "exec"]
prompt_transport = "argv"
output = "text|--json jsonl"
[launch_modes.app_server]
argv = ["codex", "app-server"]
io = "stdio-jsonrpc"

[profile]           # D
native_home = ".codex"
home_override_env = "CODEX_HOME"
config_files = ["config.toml"]
config_format = "toml"
scopes = ["user"]

[credentials]       # E
api_key_env = ["OPENAI_API_KEY"]
oauth_mechanism = "observed: ChatGPT login writes auth.json under CODEX_HOME"
credential_files = ["auth.json"]
forbidden_fields = ["auth.json contents", "tokens"]

[isolation]         # F
session_state = "observed: CODEX_HOME/sessions/*.jsonl"
unsafe_state = ["auth.json", "history.jsonl"]
concurrency = "unknown"

[resource_surfaces] # G —— 三态
instructions_AGENTS_md = "supported"
skills = "unknown"
mcp = "supported"
prompts = "unknown"
rules = "unknown"
subagents = "unknown"
commands = "unknown"
hooks = "unknown"
plugins = "unknown"
memory = "unknown"

[events]            # H
exec_json = "supported"          # declared/observed 前缀化
final_message = "supported"
usage_tokens = "supported"

[control]           # I
interrupt = "unknown"
steer = "unknown"
resume = "supported"

[continuation]      # I/J
native_resume = "supported"
contract_candidate = "agent-box.codex-continuation@1"

[runtime]           # C
network = "required"
sandbox_native = "workspace-write|read-only|danger-full-access"

[unresolved]        # 未验证问题
item1 = "steer 是否存在原生 API"
```

## 最小版（Tier C 额外候选）

Tier C 候选只需 `[meta]`、`[identity]`、`[distribution]`、`[platform]`、
`[executable]`（若已知）、`[unresolved]`，其余节省略或填 `"unknown"`。

## 与正式 harnesses.toml 的关系

正式 schema（`registry/schema.py::definition_from_dict`）目前只接受：
`schema_version, identity, executable, profile, launch_modes, runtime, inputs,
credential, continuation, capabilities, driver`。
candidate.toml 的信息若要进入正式 Registry，必须先经
FILL_AND_MODIFICATION_PLAN.md 逐项裁决（FILL_EXISTING_FIELD / ADD_REGISTRY_FIELD /
MOVE_TO_NATIVE_ADAPTER / …），不得整表复制。
