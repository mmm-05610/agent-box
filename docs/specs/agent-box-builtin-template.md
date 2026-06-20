# agent-box 内置模板常量 Spec

## 目标

去掉 `init-template` 命令和 `~/.agent-box/template/` 目录依赖，改为 library.py 内置模板常量，和 `_BUILTIN_PROVIDERS` 一致的模式。

## library.py 追加

```python
# ============================================================
# 内置模板（CC 共享配置，不含 env/permissions/API key）
# ============================================================

_TEMPLATE_SETTINGS: dict = {
    "includeCoAuthoredBy": False,
    "model": "sonnet",
    "outputStyle": "explanatory",
    "skipWorkflowUsageWarning": True,
    "theme": "dark",
    "showTurnDuration": True,
    "autoCompactThreshold": 0.75,
    "enabledPlugins": {},
    "extraKnownMarketplaces": {},
}

_TEMPLATE_SETTINGS_LOCAL: dict = {}

_TEMPLATE_CLAUDE_MD: str = "# {name}\n\n*agent-box profile — created {date}*\n"

_TEMPLATE_CLAUDE_JSON: dict = {}
```

## profile.py 修改

`create()` 函数改为从 `library._TEMPLATE_SETTINGS` 等常量复制，不再读 `~/.agent-box/template/` 目录：

```python
def create(name: str, provider_id: str) -> Path:
    from . import library

    # 1. 从 library 常量取模板
    settings = dict(library._TEMPLATE_SETTINGS)
    settings_local = dict(library._TEMPLATE_SETTINGS_LOCAL)
    claude_md = library._TEMPLATE_CLAUDE_MD.format(
        name=name,
        date=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )
    claude_json = dict(library._TEMPLATE_CLAUDE_JSON)

    # 2. 取 provider env（模板 + 覆盖值合并）
    provider = library.get_provider(provider_id, "cc")
    if not provider:
        raise ProfileError(f"provider {provider_id!r} not found")
    settings["env"] = provider["env"]

    # 3. 写 profile 目录
    profile_dir = config.profile_dir(name)
    dot_claude = config.profile_dot_claude(name)
    dot_claude.mkdir(parents=True, exist_ok=True)

    _write_json(config.profile_settings_json(name), settings)
    _write_json(config.profile_settings_local_json(name), settings_local)
    _write_text(config.profile_claude_md(name), claude_md)
    _write_json(config.profile_dot_claude_json(name), claude_json)

    # 4. skills symlink（如果存在）
    real_skills = config.real_claude_dir() / "skills"
    profile_skills = dot_claude / "skills"
    if real_skills.exists() and not profile_skills.exists():
        profile_skills.symlink_to(real_skills)

    # 5. commands 空目录
    (dot_claude / "commands").mkdir(exist_ok=True)

    # 6. meta.yaml
    _write_meta(name, "cc", provider_id)

    return profile_dir
```

> 如果 `init-template` 生成的真实 template 目录存在且包含用户自定义内容，优先读目录（过渡期）。常量仅为默认值。如果目录不存在，直接用常量。

## cli.py 修改

1. 删除 `init-template` 子命令定义（p_init 段）
2. 删除 `cmd_init_template` 函数
3. `cmd_create` 中不再调用 `init_template()`

## 验收

```bash
# 1. init-template 已消失
agent-box --help  | grep -c init-template     # → 0

# 2. 直接 create（无 template 目录，首次即用）
rm -rf ~/.agent-box/template
agent-box create test-from-constant --provider deepseek
agent-box show test-from-constant             # → model=deepseek-v4-pro
agent-box config test-from-constant outputStyle  # → explanatory

# 3. 清理
agent-box delete test-from-constant --force

# 4. 回归：旧 profile 不受影响
agent-box list                                # → decision + dw
agent-box show dw                             # → 正常
```

## 文件变更

| 操作 | 文件         | 内容                      |
| ---- | ------------ | ------------------------- |
| 修改 | `library.py` | 加 `_TEMPLATE_*` 常量     |
| 修改 | `profile.py` | `create()` 改用常量       |
| 修改 | `cli.py`     | 删除 `init-template` 命令 |

## 约束

- 零外部依赖
- 不修改现有 profile
- 如果 `~/.agent-box/template/` 存在且包含有效 settings.json，优先读目录（兼容已有环境）
