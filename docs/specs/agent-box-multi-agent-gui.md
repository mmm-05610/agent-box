# agent-box 多 Agent 支持 + GUI

实现 agent-box 对 Codex、Hermes、OpenCode 的 bwrap 配置隔离支持，以及一个 NiceGUI 启动面板。

## 核心抽象

四个 agent 都是"一个系统配置目录，所有数据在里面"的模式。复用 CC 的 bwrap 覆写套路：

```
profile/dot-<agent>/  --bwrap bind mount-->  ~/.<agent>/
```

## Agent Type 注册表

在 `library.py` 中新增：

```python
_AGENT_TYPES = {
    "cc":       {"config_dir": "~/.claude",        "binary": "claude"},
    "codex":    {"config_dir": "~/.codex",          "binary": "codex"},
    "hermes":   {"config_dir": "~/.hermes",         "binary": "hermes"},
    "opencode": {"config_dir": "~/.config/opencode", "binary": "opencode"},
}
```

## 需要修改的文件（按依赖顺序）

### 1. `src/agent_box/library.py` — 新增模板常量和 agent type 注册

在最底部（`get_provider_ids()` 之后）新增：

```python
# Agent type registry
_AGENT_TYPES = {
    "cc": {"config_dir": "~/.claude",        "binary": "claude"},
    "codex": {"config_dir": "~/.codex",      "binary": "codex"},
    "hermes": {"config_dir": "~/.hermes",    "binary": "hermes"},
    "opencode": {"config_dir": "~/.config/opencode", "binary": "opencode"},
}

def get_agent_types() -> List[str]:
    return sorted(_AGENT_TYPES.keys())

def get_agent_config(agent_type: str) -> Optional[Dict[str, str]]:
    return _AGENT_TYPES.get(agent_type)
```

新增每个 agent type 的最小模板常量。这些是创建 profile 时用来构建配置目录的默认内容。参考真实配置的格式：

```python
# Codex 模板
_TEMPLATE_CODEX_CONFIG_TOML = """\
model_provider = "custom"
model = "REPLACE_MODEL"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers]
[model_providers.custom]
name = "custom"
base_url = "REPLACE_BASE_URL"
wire_api = "responses"
requires_openai_auth = true
"""

_TEMPLATE_CODEX_AUTH_JSON = """\
{
  "OPENAI_API_KEY": ""
}
"""

# Hermes 模板
_TEMPLATE_HERMES_CONFIG_YAML = """\
model:
  default: REPLACE_MODEL
  provider: custom
  base_url: REPLACE_BASE_URL
  api_key: ""
terminal:
  backend: local
  cwd: .
  timeout: 180
memory:
  memory_enabled: true
  user_profile_enabled: true
"""

# OpenCode 模板
_TEMPLATE_OPENCODE_CONFIG_JSONC = """\
{
  "$schema": "https://opencode.ai/config.json"
}
"""

# 模板配置获取函数
def get_template_files(agent_type: str) -> Dict[str, str]:
    """返回 {文件名: 内容} 的模板配置。CC 返回 {}，已在 _TEMPLATE_SETTINGS 处理。"""
    if agent_type == "codex":
        return {
            "config.toml": _TEMPLATE_CODEX_CONFIG_TOML,
            "auth.json": _TEMPLATE_CODEX_AUTH_JSON,
        }
    elif agent_type == "hermes":
        return {
            "config.yaml": _TEMPLATE_HERMES_CONFIG_YAML,
        }
    elif agent_type == "opencode":
        return {
            "opencode.jsonc": _TEMPLATE_OPENCODE_CONFIG_JSONC,
        }
    return {}  # cc 用已有模板，不需要额外文件
```

### 2. `src/agent_box/config.py` — 路径函数泛化

新增函数（放在现有 CC 专用路径函数之后、`supported_providers()` 之前）：

```python
# Agent type path helpers

def agent_config_dir(agent_type: str) -> str:
    """Return the real config directory path for an agent type."""
    mapping = {
        "cc":       "~/.claude",
        "codex":    "~/.codex",
        "hermes":   "~/.hermes",
        "opencode": "~/.config/opencode",
    }
    return mapping.get(agent_type, f"~/.{agent_type}")

def real_agent_dir(agent_type: str) -> Path:
    """Resolved real path to the agent config directory on the host."""
    return Path(os.path.expanduser(agent_config_dir(agent_type))).resolve()

def profile_agent_dir(name: str, agent_type: str) -> Path:
    """Path inside the profile directory that will be bind-mounted."""
    suffix = "dot-claude" if agent_type == "cc" else f"dot-{agent_type}"
    return profile_dir(name) / suffix

def agent_binary(agent_type: str) -> str:
    """The executable name for an agent type."""
    mapping = {"cc": "claude", "codex": "codex", "hermes": "hermes", "opencode": "opencode"}
    return mapping.get(agent_type, agent_type)
```

### 3. `src/agent_box/profile.py` — create/list/show 支持多 agent type

**修改 `create` 函数签名和实现**：

```python
def create(name: str, agent_type: str = "cc", provider: Optional[str] = None) -> Path:
```

- CC (`agent_type="cc"`)：保持现有行为（从 `_TEMPLATE_SETTINGS` 构建 + provider 注入）。向后完全兼容。
- 其他 agent_type：创建 `profile_agent_dir(name, agent_type)` 目录，调用 `library.get_template_files(agent_type)` 获取模板文件列表，逐个写入文件。不注入 provider。
- meta.yaml 写入 `agent_type` 字段

**修改 `show` 函数**：适配不同 agent type 的目录结构。`info["config_dir"]` 指向 `profile_agent_dir(name, meta["agent_type"])`。

**`list_profiles` 保持不变**（已经读 agent_type）。

### 4. `src/agent_box/launch.py` — 泛化 bwrap 启动

**参数化 `build_bwrap_argv`**：接受 `profile_dir` + `real_dir` 替代硬编码的 CC 路径。

**新增 `launch` 函数**：

```python
def launch(name: str) -> None:
    """从 meta.yaml 读 agent_type，自动分派到对应的启动逻辑。"""
    meta = profile.load_meta(name)
    agent_type = meta.get("agent_type", "cc")

    if agent_type == "cc":
        launch_cc(name)
        return

    agent_cfg = library.get_agent_config(agent_type)
    # bind mount profile_agent_dir → real_agent_dir
    # exec bwrap → binary
    ...
```

**保留 `launch_cc` 不变**（向后兼容）。

### 5. `src/agent_box/cli.py` — 新增子命令

- `create` 命令新增 `--type` / `-t` 参数（choices=["cc","codex","hermes","opencode"]，默认 "cc"）
  - 非 CC 时不强制 `--provider`
- 新增 `launch <name>` 子命令
- 新增 `codex <name>` 子命令（内部调 `launch.launch()`）
- 新增 `hermes <name>` 子命令
- 新增 `opencode <name>` 子命令
- `list` 输出加 `type` 列
- 新增 `gui` 子命令（启动 NiceGUI）
- `cc` 保留不变

### 6. `src/agent_box/gui.py` — 新文件，NiceGUI 管理界面

```python
"""agent-box GUI — profile management web interface."""
```

功能：

- 通过 `agent-box gui` 启动
- 使用 NiceGUI（try/except 导入，提示 `pip install nicegui`）
- 默认端口 8080
- 页面结构：
  - 标题 "Agent Box"
  - 按 agent_type 分组显示 profile 卡片
  - 每个 profile：[▶ Launch]、[Edit]、[Delete] 按钮
  - 顶部 [+ Create] 按钮打开创建对话框
- Launch 按钮：调用 `subprocess.Popen(["agent-box", "launch", name])` 在新终端启动
- Edit 按钮：打开 profile 的配置目录（`xdg-open` 或类似）
- Delete 按钮：确认后调 `profile.delete(name, force=True)`

### 7. `pyproject.toml` — 可选依赖

在 `[project]` 或 `[project.optional-dependencies]` 中：

```toml
[project.optional-dependencies]
gui = ["nicegui"]
```

## 关键约束

1. **零外部依赖**：nicegui 是 optional，gui.py 在 import 失败时给出友好提示
2. **不修改用户真实配置目录**：只读用户文件，写只写 profile 目录
3. **CC 向后完全兼容**：`create` 和 `cc` 的现有行为不变
4. **模板常量最小化**：Codex/Hermes/OpenCode 的模板只包含最小的有效配置
5. **不注入 provider**：新 agent type 的 provider 信息通过环境变量传给 bwrap 子进程

## 验收步骤

```bash
# 1. 创建不同 agent type 的 profile
agent-box create test-cc --type cc --provider deepseek    # CC 仍然需要 --provider
agent-box create test-codex --type codex                   # 新 agent 不需要 provider
agent-box create test-hermes --type hermes
agent-box create test-oc --type opencode

# 2. 列表显示 agent_type 列
agent-box list

# 3. 查看
agent-box show test-codex

# 4. 通过 CLI 启动（不实跑，只验证参数构造正确）
# agent-box launch test-cc
# agent-box codex test-codex
# agent-box hermes test-hermes
# agent-box opencode test-oc

# 5. GUI
agent-box gui
# 浏览器 http://localhost:8080

# 6. 清理
agent-box delete test-cc --force
agent-box delete test-codex --force
agent-box delete test-hermes --force
agent-box delete test-oc --force
```
