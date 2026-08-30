# ACS Integration Spec
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 状态：已确认，待实施
> 分支：`feat/acs-integration`

## 目标

把 agent-box 的配置管理数据源从"自己维护的 library 数据库"切换到"读 ACS (fork of CC Switch) 的 SQLite"。

agent-box 不再维护 provider、MCP server、skill、prompt 的 CRUD。这些配置在 ACS 里管理，agent-box 只读数据，用于 profile 的 apply 和启动。

## 架构

```
ACS (agent-config-store)
  ├── Provider/MCP/Skill/Prompt 管理（GUI 操作）
  ├── 数据：~/.cc-switch/cc-switch.db
  └── Phase 1 不改代码

agent-box
  ├── 读 ACS SQLite（只读适配器）
  ├── Profile 详情页展示 ACS 配置列表
  ├── Apply 按钮 → 注入配置到 profile 文件系统
  ├── bwrap 启动
  └── 数据库只保留 profiles + sessions 表
```

## 实施步骤

### Step 1：写 ACS 数据适配器

**文件：** `src/agent_box/ccswitch_adapter.py`（新文件，~150 行）

从 CC Switch SQLite 读数据，返回跟现有 agent-box API 兼容的 dict 格式。

```python
def list_providers(agent_type) -> list[dict]
def get_provider(agent_type, provider_id) -> dict | None
def list_mcp_servers(agent_type) -> list[dict]
def get_mcp_server(server_id) -> dict | None
def list_skills(agent_type) -> list[dict]
def get_skill(skill_id) -> dict | None
def list_claude_mds(agent_type) -> list[dict]
def get_claude_md(agent_type, md_id) -> dict | None
```

**关键问题：** CC Switch DB 在 Windows 侧（`/mnt/c/Users/maoqh/.cc-switch/cc-switch.db`），WSL 9P 文件系统可能无法直接打开 SQLite。需要先测试，不行就 copy 到 `/tmp` 再读。

**字段映射：**

- `settings_config` → `settings`（JSON 字符串 → dict）
- `server_config` → `server_config_parsed`（JSON 字符串 → dict）
- `enabled_<agent>` 列 → `agent_types` 列表
- `app_type` → `agent_type`

### Step 2：bridge.py 切数据源

**文件：** `gui-web/bridge.py`（~30 行改动）

改这些方法，用 ccswitch_adapter 替换原有的 CLI 调用：

- `list_providers` → `ccswitch_adapter.list_providers`
- `get_provider` → `ccswitch_adapter.get_provider`
- `list_mcp_servers` → `ccswitch_adapter.list_mcp_servers`
- `get_mcp_server` → `ccswitch_adapter.get_mcp_server`
- `list_skills` → `ccswitch_adapter.list_skills`
- `get_skill` → `ccswitch_adapter.get_skill`
- `list_claude_mds` → `ccswitch_adapter.list_claude_mds`
- `get_claude_md` → `ccswitch_adapter.get_claude_md`

API 返回格式不变，前端无需改动。

### Step 3：精简 agent-box 数据库

**文件：** `src/agent_box/schema.sql`

删掉 17 张 CC Switch 表，只保留 2 张 agent-box 专属表：

- `profiles` — profile 元数据
- `sessions` — 启动历史

### Step 4：清理后端旧代码

保留 apply 函数，删掉 CRUD 逻辑：

| 文件            | 保留                                                                     | 删除                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `providers.py`  | `apply_provider`                                                         | `list_providers`、`get_provider`、`add_provider`、`edit_provider`、`delete_provider`、`duplicate_provider`、`upsert_provider`、`resolve_usage_credentials`、所有 usage query 函数 |
| `mcp.py`        | `apply_mcp_server` + 4 个 `_apply_*` 辅助函数 + TOML/YAML/JSONC 工具函数 | `list_mcp_servers`、`get_mcp_server`、`upsert_mcp_server`、`delete_mcp_server`、`set_mcp_agent`                                                                                   |
| `skills.py`     | `apply_skill`                                                            | `list_skills`、`get_skill`、`upsert_skill`、`delete_skill`、`set_skill_agent`                                                                                                     |
| `claude_mds.py` | `apply_claude_md`                                                        | `list_claude_mds`、`get_claude_md`、`add_claude_md`、`upsert_claude_md`、`edit_claude_md`、`delete_claude_md`                                                                     |

### Step 5：前端处理

**隐藏 Library 页面：**

- 注释掉 `App.tsx` 里的 Library 路由/导航入口
- 不删代码，后续确认不需要了再删

**Profile 详情页不需要改动：**

- Provider apply from library 已经实现
- MCP/Skill/CLAUDE.md apply from library 后续需要时补上

### Step 6：验证

- [ ] bridge.py 能正常启动
- [ ] Profile 详情页能看到 ACS provider 列表
- [ ] Apply provider 到 profile 正常工作
- [ ] bwrap 启动正常

## 不在此 scope 的

- ❌ 改 ACS fork 代码
- ❌ 前端 MCP/Skill/CLAUDE.md apply from library（后续再补）
- ❌ Library 页面删除（先隐藏）
- ❌ 多 agent 协作
