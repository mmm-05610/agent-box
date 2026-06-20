# agent-box Provider 架构修正 Spec

## 问题

当前 `library.py` 内置数据格式简化（只有 base_url + model），建表即 seed 到 library.db，模板和用户实例混在库里。需要修正为：

```
library.py _BUILTIN_PROVIDERS     ← 模板（完整 env，key=""），纯常量
         ↓ 无 seed，直接读
library.db user_overrides         ← 只存用户修改（key、自定义 model）
         ↓ 查询时合并
apply_provider → profile env 块   ← 覆盖 settings.json
```

## library.py 内置数据格式

`_BUILTIN_PROVIDERS` 改为完整 Anthropic env 块格式，来源于 cc-switch `claudeProviderPresets.ts`：

```python
_BUILTIN_PROVIDERS: list[dict] = [
    {
        "id": "deepseek",
        "app_type": "cc",
        "name": "DeepSeek",
        "label": "DeepSeek (深度求索)",
        "region": "cn",
        "tags": ["deepseek", "cn"],
        "env": {
            "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
            "ANTHROPIC_AUTH_TOKEN": "",                          # 空，等用户填
            "ANTHROPIC_MODEL": "deepseek-v4-pro",
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-v4-flash",
            "ANTHROPIC_DEFAULT_SONNET_MODEL": "deepseek-v4-pro",
            "ANTHROPIC_DEFAULT_OPUS_MODEL": "deepseek-v4-pro",
            "API_TIMEOUT_MS": 3000000,
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1,
        },
    },
    # ... 54+ 条
]
```

## library.db 改造

替换现有 `components` 表：

```sql
-- user_overrides: 只存用户修改过的字段
CREATE TABLE IF NOT EXISTS user_overrides (
    component_type TEXT NOT NULL,          -- 'provider' | 'mcp_server'
    component_id   TEXT NOT NULL,
    field_path     TEXT NOT NULL,          -- 'env.ANTHROPIC_AUTH_TOKEN' | 'env.ANTHROPIC_MODEL' | ...
    field_value    TEXT NOT NULL,
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (component_type, component_id, field_path)
);
```

删除现有的 `components` 表和自动 seed 逻辑。

## library.py API

```python
# 查 provider（合并模板 + 覆盖值）
def get_provider(id: str, app_type: str = "cc") -> dict | None:
    """先从 _BUILTIN_PROVIDERS 找模板，再叠加 user_overrides"""
    template = _find_builtin(id, app_type)
    if not template:
        return None
    overrides = _load_overrides("provider", id)
    result = dict(template)
    if overrides:
        # 合并 env 字段
        for path, val in overrides.items():
            _deep_set(result, path, val)
    return result

# 查 MCP server（同上）
def get_mcp_server(id: str) -> dict | None: ...

# 设置覆盖值
def set_override(component_type: str, component_id: str, field_path: str, value: str):
    """INSERT OR REPLACE INTO user_overrides"""

# 删除覆盖值（恢复模板默认值）
def delete_override(component_type: str, component_id: str, field_path: str): ...

# 列出所有 provider
def list_providers(app_type: str = None) -> list[dict]:
    """返回模板列表，标记哪些有用户覆盖值"""

# 列出所有 MCP server
def list_mcp_servers() -> list[dict]: ...

# 初始化 store（幂等建表，不 seed 数据）
def init_store() -> None:
    """仅建表。不 seed。"""
```

## profile.py 新增

```python
def apply_provider(profile_name: str, provider_id: str) -> None:
    """从 library 取 provider 完整 env → 覆盖 profile settings.json env 块"""
    provider = library.get_provider(provider_id, "cc")
    if not provider:
        raise ProfileError(f"provider {provider_id!r} not found in library")
    data = read_settings(profile_name)
    data["env"] = provider["env"]      # 整体替换
    write_settings(profile_name, data)
```

## CLI 命令

### component 子命令简化

```
agent-box component list [--type provider|mcp_server]   # 列出模板
agent-box component show <id> [--type provider]          # 模板 + 用户覆盖值标记
agent-box component set <id> <field_path> <value>        # 设置覆盖值
                                                           例: component set deepseek env.ANTHROPIC_AUTH_TOKEN sk-xxx
agent-box component unset <id> <field_path>              # 删除覆盖值，恢复默认
agent-box component edit <id>                            # $EDITOR 打开覆盖值编辑
```

### cc 子命令新增参数

```
agent-box cc <name> [--provider <id>] [--resume]
```

如果指定 `--provider`：先调 `profile.apply_provider` 换供应商，再启动。

## 验收

```bash
# 1. 列出 54 个 provider（无 seed，常量直读）
agent-box component list --type provider

# 2. 查看模板
agent-box component show deepseek
# → env.ANTHROPIC_AUTH_TOKEN: (not set)

# 3. 填 key
agent-box component set deepseek env.ANTHROPIC_AUTH_TOKEN sk-real-key

# 4. 再次查看 → key 已填
agent-box component show deepseek
# → env.ANTHROPIC_AUTH_TOKEN: sk-r...-key

# 5. 恢复到模板默认
agent-box component unset deepseek env.ANTHROPIC_AUTH_TOKEN

# 6. 给 profile 换供应商
agent-box cc DW --provider glm
# → DW 的 settings.json env 块被 GLM 完整配置覆盖
# → bwrap 启动

# 7. 换供应商 + 恢复上次会话
agent-box cc DW --provider deepseek --resume
```

## 文件变更

| 操作     | 文件         | 内容                                                                     |
| -------- | ------------ | ------------------------------------------------------------------------ |
| **重写** | `library.py` | 内置数据格式改 env 块，去掉 seed，加 user_overrides 表，加 set/unset API |
| 修改     | `profile.py` | 加 `apply_provider`                                                      |
| 修改     | `cli.py`     | `component` 改 set/unset/edit；`cc` 加 --provider/--resume               |

## 约束

- 零外部依赖
- library.db 只存 user_overrides，首次创建时仅建表、不 seed
- 内置数据始终存在 Python 常量里，clone 即用
- 已存在的 library.db 需要在代码中处理迁移（DROP 旧 components 表，CREATE user_overrides 表）
