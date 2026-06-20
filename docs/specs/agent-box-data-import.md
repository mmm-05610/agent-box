# agent-box 真实数据导入 Spec

## 目标

从 cc-switch SQLite DB 和真实 `~/.claude/` 中导入已配置的 CC provider、API key、hooks、plugins、MCP server，使 agent-box 完全替代 start_claude.sh。

**只导入 Claude Code 相关数据。** Codex/Hermes/OpenCode 本次不做。

## 1. 新增 MiMo Provider

在 library.py `_BUILTIN_PROVIDERS` 中新增（插入到 deepseek 和 minimax 之间）：

```python
{
    "id": "mimo",
    "app_type": "cc",
    "name": "Xiaomi MiMo",
    "label": "MiMo (小米 MiMo)",
    "region": "cn",
    "tags": ["mimo", "cn"],
    "env": {
        "ANTHROPIC_BASE_URL": "https://token-plan-cn.xiaomimimo.com/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "",
        "ANTHROPIC_MODEL": "mimo-v2.5-pro",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": "mimo-v2.5",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "mimo-v2.5-pro",
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "mimo-v2.5-pro",
        "DISABLE_AUTOUPDATER": 1,
        "ENABLE_TOOL_SEARCH": "true",
        "API_TIMEOUT_MS": 3000000,
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1,
    },
},
```

## 2. 修正内置 Model 名

在 library.py `_BUILTIN_PROVIDERS` 中：

- `glm`: `ANTHROPIC_MODEL` 从 `glm-5` 改为 `glm-5.1`
- `minimax`: `ANTHROPIC_MODEL` + 所有 tier model 从 `MiniMax-M2.7` 改为 `MiniMax-M3`

## 3. 模板常量补 hooks/plugins

在 library.py `_TEMPLATE_SETTINGS` 中，当前 hooks 和 enabledPlugins 为空，替换为以下真实值：

```python
"hooks": {
    "PreToolUse": [
        {
            "matcher": "Bash",
            "hooks": [
                {
                    "type": "command",
                    "command": "python -c \"import sys,json; cmd=json.load(sys.stdin)['tool_input']['command']; sys.exit(2 if any(op in cmd for op in ['rm -rf','git push --force','git push -f','git reset --hard','chmod 777', ':(){ ']) else 0)\""
                }
            ]
        }
    ],
    "PostToolUse": [
        {
            "matcher": "Write|Edit",
            "hooks": [
                {
                    "type": "command",
                    "command": "npx prettier --write \"$CLAUDE_FILE\" 2>nul || true"
                }
            ]
        }
    ],
    "Stop": [
        {
            "matcher": "always",
            "hooks": [
                {
                    "type": "command",
                    "command": "python3 /home/maoqh/projects/obsidian-knowledge-brain/scripts/session_harvester.py --mode stop"
                }
            ]
        }
    ],
    "SessionStart": [
        {
            "matcher": "always",
            "hooks": [
                {
                    "type": "command",
                    "command": "python3 /home/maoqh/projects/obsidian-knowledge-brain/scripts/session_harvester.py --mode start && python3 /home/maoqh/projects/obsidian-knowledge-brain/scripts/compiler.py"
                }
            ]
        }
    ]
},
"enabledPlugins": {
    "rust-analyzer-lsp@claude-plugins-official": True,
    "superpowers@superpowers-marketplace": True,
    "superpowers@claude-plugins-official": True,
    "python-dev@cc-thingz": True,
    "dev-workflow@cc-thingz": True,
},
"extraKnownMarketplaces": {
    "superpowers-marketplace": {
        "source": {
            "source": "github",
            "repo": "obra/superpowers-marketplace"
        }
    },
    "cc-thingz": {
        "source": {
            "source": "github",
            "repo": "alexei-led/cc-thingz"
        }
    }
},
```

## 4. 导入 API Key（一次性脚本）

新建 `scripts/import_ccswitch_keys.py`，从 cc-switch DB 读取 CC provider 的 API key，写入 agent-box user_overrides：

```python
import sqlite3, json
from pathlib import Path

CCSWITCH_DB = Path("/mnt/c/Users/maoqh/.cc-switch/cc-switch.db")

# cc-switch model → agent-box provider id 映射
MODEL_TO_PROVIDER = {
    "deepseek-v4-pro": "deepseek",
    "mimo-v2.5-pro": "mimo",
    "glm-5.1": "glm",
    "MiniMax-M3": "minimax",
}

def import_keys():
    src = sqlite3.connect(str(CCSWITCH_DB))
    src.row_factory = sqlite3.Row

    # 导入 agent_box library 的 set_override
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
    from agent_box.library import set_override

    count = 0
    for r in src.execute(
        "SELECT id, name, settings_config FROM providers WHERE app_type='claude'"
    ).fetchall():
        sc = json.loads(r["settings_config"])
        env = sc.get("env", {})
        key = env.get("ANTHROPIC_AUTH_TOKEN", "")
        model = env.get("ANTHROPIC_MODEL", "")

        if not key or key.startswith("sk-REPLACE"):
            continue

        provider_id = MODEL_TO_PROVIDER.get(model)
        if not provider_id:
            print(f"SKIP {r['name']}: model={model} not in mapping")
            continue

        set_override("provider", provider_id, "env.ANTHROPIC_AUTH_TOKEN", key)
        print(f"IMPORTED {r['name']} → {provider_id} (model={model})")
        count += 1

    print(f"Done: {count} keys imported")

if __name__ == "__main__":
    import_keys()
```

运行：`python3 scripts/import_ccswitch_keys.py`

> 这是一个一次性脚本，导入后不再需要。

## 5. 补缺的 MCP Server

在 library.py `_BUILTIN_MCP_SERVERS` 中追加（从 cc-switch mcp_servers 表读取）：

```python
{
    "id": "context7",
    "name": "Context7",
    "server_config": json.dumps({
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@upstash/context7-mcp"],
    }),
    "description": "Upstash Context7 MCP server",
    "tags": ["search", "docs"],
},
{
    "id": "git",
    "name": "Git MCP",
    "server_config": json.dumps({
        "type": "stdio",
        "command": "python",
        "args": ["-m", "mcp_server_git"],
    }),
    "description": "Git MCP server",
    "tags": ["git", "vcs"],
},
{
    "id": "forgecraft",
    "name": "ForgeCraft",
    "server_config": json.dumps({
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "forgecraft-mcp"],
    }),
    "description": "ForgeCraft MCP server",
    "tags": ["forgecraft"],
},
```

> 实际 command/args 从 cc-switch mcp_servers 表的 server_config JSON 中读取，确保精确匹配。

## 验收

```bash
# 1. MiMo provider 存在
agent-box component list --type provider | grep mimo

# 2. 模型名已修正
agent-box component show glm | grep glm-5.1
agent-box component show minimax | grep MiniMax-M3

# 3. 模板有 hooks
python3 -c "
from agent_box.library import _TEMPLATE_SETTINGS
print('PreToolUse' in _TEMPLATE_SETTINGS.get('hooks', {}))   # → True
print(len(_TEMPLATE_SETTINGS.get('enabledPlugins', {})))     # → 5
"

# 4. API key 已导入（运行导入脚本后）
agent-box component show deepseek | grep AUTH_TOKEN
# → ANTHROPIC_AUTH_TOKEN: sk-...  (不再显示 not set)

# 5. 创建新 profile 自带 hooks/plugins
agent-box create test-import --provider deepseek
agent-box config test-import enabledPlugins | grep python-dev

# 6. 清理
agent-box delete test-import --force
```

## 文件变更

| 操作 | 文件                              | 内容                                                              |
| ---- | --------------------------------- | ----------------------------------------------------------------- |
| 修改 | `library.py`                      | 加 MiMo，修正 GLM/MiniMax 模型名，补 hooks/plugins 到模板，补 MCP |
| 新建 | `scripts/import_ccswitch_keys.py` | 一次性导入 key 脚本                                               |

## 约束

- import_ccswitch_keys.py 是一次性脚本，不进用户路径
- 不碰 Codex/Hermes/OpenCode 数据（本次只 CC）
- 已有 profile 的 settings.json 不受影响（只改库和模板，不自动 apply）
