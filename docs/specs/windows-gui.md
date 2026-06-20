# agent-box Windows Desktop GUI Spec

## 概述

Windows 桌面应用，通过 Tkinter 提供类似 cc-switch 的 agent 启动面板。管理 WSL 内的 agent-box profile，点击启动时打开 Windows Terminal 执行 WSL 命令。

## 技术栈

- **语言**：Python 3（Windows 上运行）
- **GUI**：Tkinter（Python 自带，零额外依赖）
- **WSL 通信**：`wsl.exe agent-box list --json` 读数据
- **终端启动**：`wt.exe`（Windows Terminal）

## 界面布局

```
┌──────────────────────────────────────────────────────┐
│  Agent Box                                           │
│──────────────────────────────────────────────────────│
│                                                      │
│  ── CC ──────────────────────────────────────────────│
│  │ dw          [▶ Launch]  [▼ 继续上次]              │
│  │ decision    [▶ Launch]  [▼ 新会话  ]              │
│                                                      │
│  ── Codex ───────────────────────────────────────────│
│  │ codex-main  [▶ Launch]  [▼ 新会话  ]              │
│                                                      │
│  ── Hermes ──────────────────────────────────────────│
│  │ hermes-main [▶ Launch]  [▼ 继续上次]              │
│                                                      │
│  ── OpenCode ────────────────────────────────────────│
│  │ opencode-main [▶ Launch]  [▼ 新会话  ]            │
│                                                      │
│──────────────────────────────────────────────────────│
│  [↻ Refresh]                                         │
└──────────────────────────────────────────────────────┘
```

## 数据获取

```python
import subprocess, json
result = subprocess.run(
    ["wsl.exe", "agent-box", "list", "--json"],
    capture_output=True, text=True
)
profiles = json.loads(result.stdout)
# [{name, agent_type}, ...]
```

## 启动逻辑

下拉框选项：**新会话** / **继续上次**

| Agent Type | 新会话命令 | 继续上次命令          |
| ---------- | ---------- | --------------------- |
| cc         | `claude`   | `claude --continue`   |
| codex      | `codex`    | `codex resume --last` |
| hermes     | `hermes`   | `hermes -c`           |
| opencode   | `opencode` | `opencode`            |

点击 Launch 时构造并执行：

```
wt.exe wsl.exe bash -c "agent-box <type> <name> [resume_args]"
```

WT 会打开新的 Windows Terminal 标签页，里面跑 WSL + agent。

## 文件结构

独立的 Windows 脚本，放在工程根目录：

```
agent-box/
└── gui-windows.py    # 在 Windows 上直接用 python gui-windows.py 运行
```

## 页面刷新

- 首次加载自动刷新
- [↻ Refresh] 按钮手动刷新列表
- Launch 后自动不刷新（终端异步启动）

## 依赖

仅需 Windows 上安装：

- Python 3（自带 Tkinter）
- Windows Terminal（wt.exe，Windows 10/11 自带或 Store 安装）

## 验收

1. Windows 上 `python gui-windows.py` 启动
2. 看到 cc/codex/hermes/opencode 分组，每个 profile 有 Launch 按钮和下拉框
3. 选"新会话"点 Launch → 弹出 Windows Terminal，启动对应 agent
4. 选"继续上次"点 Launch → 弹出 Windows Terminal，传 resume 参数启动
