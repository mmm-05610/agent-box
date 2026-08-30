# 项目 Profile 隔离
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 状态：2.0 MVP 已实现
> 日期：2026-08-18

## 目标

Agent Box 从用户选择的目录启动 Agent 时，自动接管该 Agent 能发现的项目级
配置入口，并按现有系统 Profile 隔离。Agent 仍读取 `.claude`、`.codex`、
`AGENTS.md` 等原生路径，不感知 `.agent-box` 或 Bubblewrap。

本阶段只解决项目配置收敛与隔离，不定义角色、任务、通信、共享知识或多 Agent
编排协议。

## 存储布局

每个原生配置发现层都有自己的项目 Profile backing：

```text
<layer>/.agent-box/profiles/<profile-name>/root/<native-relative-path>
```

例如：

```text
repo/.agent-box/profiles/decision/root/.codex
    --bind
repo/.codex

repo/backend/src/.agent-box/profiles/decision/root/.codex
    --bind
repo/backend/src/.codex
```

`profile-name` 是现有系统 Profile 不可变的 `name`，不是数据库 ID 或可编辑的
`display_name`。

## 首次启动

用户选择的 cwd 就是本次项目根。首次启动会自动建立：

```text
<cwd>/.agent-box/profiles/<profile-name>/root/
```

无需 `init`。新项目 Profile 默认空白：Agent Box 不导入或复制 cwd 中已经
存在的原生配置。原生配置仍保留在宿主机上，只在 Bubblewrap namespace 内被
私有 backing 遮住。

对于 Registry 声明的目录入口，Agent Box 创建空白可写目录；对于文件入口，
按照 presence 策略创建空文件或最小合法内容。Agent 后续对原生路径的写入会
持久化到该 Profile backing。

## Registry schema

项目配置面属于现有 `core/agent_types.json`：

```json
{
  "project": {
    "surfaces": [
      {
        "path": ".codex",
        "kind": "directory",
        "discovery": "git_root_to_cwd",
        "presence": "always"
      }
    ]
  }
}
```

字段：

- `path`：安全的项目相对路径；禁止绝对路径、反斜杠和 `..`；
- `kind`：`directory` 或 `file`；
- `discovery`：`launch_root_only`、`git_root_to_cwd` 或
  `ancestor_chain`；
- `presence`：`always`、`optional`、`exclusive_default` 或
  `exclusive_override`；
- `group`：exclusive 文件的互斥组；
- `default_text`：必须创建的文件的初始内容。

Registry 在进程加载时严格验证，未知字段或不完整的互斥组会直接报错。

## 已支持入口

### Claude Code

| 路径              | discovery         | presence                            |
| ----------------- | ----------------- | ----------------------------------- |
| `.claude`         | `git_root_to_cwd` | `always`                            |
| `.mcp.json`       | `ancestor_chain`  | `always`，默认 `{"mcpServers": {}}` |
| `CLAUDE.md`       | `git_root_to_cwd` | `always`，空白                      |
| `CLAUDE.local.md` | `git_root_to_cwd` | `always`，空白                      |

`.mcp.json` 已实测会越过内层 Git 根。Agent Box 沿祖先链检查，但父级只有
已经存在对应原生入口或 `.agent-box` 时才纳入，不会无条件在 `/home`、`/`
等目录创建状态。全局应用目录 `~/.agent-box` 不作为父级项目标记；如果 cwd
本身就是 `~`，仍可按用户明确选择将 home 作为项目根。

### Codex

| 路径                 | discovery         | presence             |
| -------------------- | ----------------- | -------------------- |
| `.codex`             | `git_root_to_cwd` | `always`             |
| `.agents`            | `git_root_to_cwd` | `always`             |
| `AGENTS.md`          | `git_root_to_cwd` | `exclusive_default`  |
| `AGENTS.override.md` | `git_root_to_cwd` | `exclusive_override` |

同一层如果宿主或私有 backing 已存在 `AGENTS.override.md`，私有 override 生效；
如果只有宿主 override，Agent Box 创建空白私有 override 将它遮住。否则创建并
挂载私有 `AGENTS.md`。

在没有 Git 根的目录中，`git_root_to_cwd` 第一版只处理 cwd，避免猜测项目
边界并意外接管 home 目录。

## 启动顺序

1. 解析 cwd、Profile 和 Registry；
2. 检查 bwrap、Agent binary 和 sandbox 对 cwd 的可见性；
3. 准备现有系统 Profile mounts；
4. 初始化 cwd 的项目 Profile 根；
5. 发现并物化项目 surfaces；
6. 生成 `sandbox → system → project outer-to-inner` 的 bind mounts；
7. 追加 namespace 选项和 `--chdir <cwd>`；
8. Popen Agent、记录 session 和退出码。

如果路径类型冲突、包含 symlink、无法创建、逃逸项目层，或 cwd 会被 tmpfs 等
sandbox mount 遮住，启动会在执行 Agent 前失败。不会 fallback 到未隔离启动。

## 暂未覆盖

- Hermes/OpenCode 的项目配置面；二者仍会初始化空项目 Profile 根；
- Codex 的动态 `project_doc_fallback_filenames`；
- 项目模板与 Agent Box 自有协议文件；
- Profile 间共享配置；
- 项目身份、任务状态、通信与多 Agent 编排。
