# GUI 编辑功能实现任务

## 背景

agent-box 的 GUI（CustomTkinter + `gui/` 包）已经完成了视觉重设计和架构分层：

- `gui/data.py` — 数据层，从 WSL 获取 profile 数据返回纯 dict
- `gui/config.py` — 各 agent type 配置解析器（CC/Codex/Hermes/OpenCode）
- `gui/pages/detail.py` — Profile detail 页，按 agent type 动态 tab，目前**只读**
- `gui/pages/wizard.py` — 4 步创建向导，目前收集数据但不执行创建
- `gui/wsl.py` — WSL 调用封装（fetch_profiles、launch_profile）

## 任务清单

### 1. Detail 页 Tab 编辑（核心）

在 `gui/pages/detail.py` 的各 tab builder 中实现编辑 + 保存：

- **settings tab（CC）** — `_build_settings_tab` 已有的 textbox，加一个 Save 按钮，点击通过 `wsl.exe cat > file` 写回
- **claude_md tab（CC）** — `_build_claude_md_tab` 同
- **config tab（Codex TOML / Hermes YAML / OpenCode JSONC）** — 同上模式
- **persona tab（Hermes SOUL.md）** — 同上
- **Save 逻辑** — 在 `gui/wsl.py` 里加一个 `save_file(path, content)` 函数，用 `wsl.exe bash -lc "cat > $WSL_PATH << 'EOF' ... EOF"` 写回

### 2. Meta Tab 操作按钮

在 `_build_meta_tab` 里加操作区：

- **Delete Profile** 按钮 — 红色 danger 按钮，弹出确认对话框，执行 `wsl.exe bash -lc "agent-box delete <name> --force"`，成功后导航回 profiles 列表
- **Open in Terminal** 按钮 — 用 `agent-box launch <name>` 启动

### 3. CreationWizard 接通 CLI

修改 `gui/pages/wizard.py` 的 `_do_finish` 方法：

- 收集到的 payload → 构造 `agent-box create <name> --type <agent_type>` 命令
- 创建成功后 toast 提示 + 刷新列表 + 导航到新 profile 的 detail 页
- 创建失败 toast 错误提示

### 4. 泛化 wsl.py

在 `gui/wsl.py` 里补充通用函数：

```python
def save_file(wsl_path: str, content: str) -> bool:
    """Write content to a file in WSL."""

def delete_profile(name: str) -> bool:
    """Delete an agent-box profile."""

def create_profile(name: str, agent_type: str) -> bool:
    """Create a new agent-box profile."""
```

## 约束

- 所有文件写入必须走 WSL（GUI 在 Windows，文件在 WSL）
- CustomTkinter 组件风格与现有代码一致
- 按钮使用 `gui/components/button.py` 的工厂函数
- 颜色用 `C("key")` token

## 参考资料

- `gui/pages/detail.py` — 当前只读 tab builder 代码
- `gui/wsl.py` — fetch_profiles / launch_profile 模式
- `gui/components/button.py` — primary_button / ghost_button / danger_button
- `src/agent_box/cli.py` — agent-box CLI 命令接口
