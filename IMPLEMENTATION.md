# agent-box — Implementation Plan (Phase 1 MVP)

> 综合方案：**A2 存储 + B1 技术栈 + C2 启动机制 + D3 隔离策略**（由 4 维设计提案 + 4 维对抗评审得出）
> 全文严格遵守 DW-PROMPT 规则：**不写任何代码**，只产出可执行的设计与计划。

---

## §1 Technical Research

### 1.1 各 Agent 配置加载机制

| Agent           | 配置目录                                                  | 关键文件                                                                                                           | HOME 重定向有效?                       | 环境变量覆盖                                                 | CLI 入口   |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------ | ---------- |
| **Claude Code** | `$HOME/.claude/`                                          | `settings.json` / `settings.local.json` / `CLAUDE.md` / `credentials.json` / `projects/` / `commands/` / `agents/` | ✅ 有效                                | ❌ 无 `CLAUDE_CONFIG_HOME`，纯 `$HOME/.claude/`              | `claude`   |
| **Codex CLI**   | `$HOME/.codex/`                                           | `config.toml` / `auth.json`                                                                                        | ✅ 有效                                | ⚠️ 存在 `CODEX_HOME`（agent-box 不依赖，自己用 HOME 重定向） | `codex`    |
| **OpenCode**    | `$XDG_CONFIG_HOME/opencode/` + `$XDG_DATA_HOME/opencode/` | config + data                                                                                                      | ✅ 有效（需在 profile 内重设 XDG\_\*） | `XDG_CONFIG_HOME` / `XDG_DATA_HOME`                          | `opencode` |
| **Hermes**      | `$HOME/.hermes/`                                          | `config.yaml` / `hermes-agent/`                                                                                    | ✅ 有效                                | config.yaml 内的 `model` / `base_url` / `api_key` 字段       | `hermes`   |

### 1.2 CC 的 `.claude.json` 陷阱（关键发现）

CC 不只在 `$HOME/.claude/` 写配置，**还在 `$HOME/.claude.json`（HOME 根目录，不在 `.claude/` 内）写入 onboarding 状态**（`hasCompletedOnboarding` 等）。HOME 重定向后该文件落在 `profile_home/.claude.json`，如果不存在，CC 会**重新进入 onboarding 流程**。

**Mitigation**：`agent-box create` 时必须显式 `Path(profile_home / '.claude.json').write_text('{"hasCompletedOnboarding": true}')`。

### 1.3 关键 env 变量清单

- **CC**：`ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `CLAUDE_CODE_GIT_BASH_PATH`
- **Codex**：`OPENAI_API_KEY` / `OPENAI_BASE_URL`
- **OpenCode**：从 `~/.config/opencode/config.json` 读 provider/api_key
- **Hermes**：从 `~/.hermes/config.yaml` 读 model/base_url/api_key

### 1.4 启动 flag 透传映射

| Agent    | launch 模式                                                                                        | 关键 flag |
| -------- | -------------------------------------------------------------------------------------------------- | --------- |
| CC       | `claude [--resume ID] [--continue] [--cwd DIR] [--model M] [--permission-mode MODE] [-p "PROMPT"]` |
| Codex    | `codex [resume [ID] \| --cd DIR \| --model M \| --profile NAME \| -c key=value]`                   |
| OpenCode | `opencode [path]`（slash 命令在 REPL 内）                                                          |
| Hermes   | `hermes [chat \| run ...]`                                                                         |

---

## §2 Profile Directory Specification

### 2.1 存储位置（方案 A2）

**根目录解析优先级**（`agent_box.paths.resolve_root()`）：

1. `$AGENT_BOX_HOME`（env 覆盖，便携/U 盘/容器场景）
2. `~/.agent-box/`（默认）

**校验**：

- 必须是绝对路径
- 拒绝含 `\n` / `\t` / `\r` 的值
- 路径长度 ≤ 4096 字符
- 编码用 `surrogateescape` 兜底

### 2.2 Profile 完整目录树

**核心原则：一个 profile = 一个 agent 类型 + 一个身份。** profile home 内只包含该类型 agent 的配置目录，不存在 `.claude/` 和 `.codex/` 共存。

```
${AGENT_BOX_HOME}/                              # 默认 ~/.agent-box/
├── config.yaml                                 # agent-box 自身配置（可选）
├── profiles/
│   ├── DW/                                     # CC + MiniMax M3，DW 执行
│   │   ├── meta.yaml                           # [managed] agent_type: cc
│   │   ├── .lock                               # [managed] flock 并发锁
│   │   └── home/                               # ← 启动时成为 $HOME
│   │       ├── .claude/                        # (只有 .claude/，没有 .codex/)
│   │       │   ├── settings.json               # [managed]
│   │       │   ├── settings.local.json         # [managed]
│   │       │   ├── CLAUDE.md                   # [managed] 角色 prompt
│   │       │   ├── credentials.json            # [managed, mode 0600]
│   │       │   ├── projects/                   # [auto] CC 自动维护
│   │       │   ├── commands/                   # [semi]
│   │       │   └── agents/                     # [semi]
│   │       ├── .claude.json                    # ⚠️ [managed] onboarding 占位
│   │       ├── .gitconfig → ${REAL_HOME}/.gitconfig    # [symlink, 默认共享]
│   │       └── .ssh/    → ${REAL_HOME}/.ssh/           # [symlink, 默认共享]
│   │
│   ├── decision/                               # CC + DeepSeek，决策者
│   │   ├── meta.yaml                           #   agent_type: cc
│   │   └── home/
│   │       └── .claude/                        #   只有 .claude/
│   │           (同上结构...)
│   │
│   ├── codex-spec/                             # Codex CLI + MiniMax，编码
│   │   ├── meta.yaml                           #   agent_type: codex
│   │   └── home/
│   │       ├── .codex/                         #   只有 .codex/
│   │       │   ├── config.toml                 # [managed]
│   │       │   └── auth.json                   # [managed, mode 0600]
│   │       ├── .gitconfig → ${REAL_HOME}/.gitconfig
│   │       └── .ssh/    → ${REAL_HOME}/.ssh/
│   │
│   └── hermes/                                 # Hermes + MiMo，秘书
│       ├── meta.yaml                           #   agent_type: hermes
│       └── home/
│           └── .hermes/                        #   只有 .hermes/
│               └── config.yaml                 # [managed]
```

### 2.3 `meta.yaml` schema

```yaml
# agent-box profile metadata
# schema_version: 1
name: DW # string, 必填, [a-z0-9-_], 唯一
agent_type: cc # enum: cc | codex | opencode | hermes
provider: minimax # enum: anthropic | minimax | deepseek | mimo | openai
description: "DW 执行者 (MiniMax M3)" # string
created_at: 2026-06-18T12:00:00Z # ISO8601
updated_at: 2026-06-18T12:00:00Z

# API 配置（launch 时注入 env）
api:
  base_url: https://api.minimax.chat/v1 # string, 必填
  api_key_env: ANTHROPIC_API_KEY # string, 指向真实 env var 名
  model: MiniMax-M3 # string

# 透传给 agent CLI 的额外 env 变量
env_overrides:
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1"
  API_TIMEOUT_MS: "300000"

# 共享策略（D3 实施）
shared:
  symlinks: # 启动时在 profile_home 内创建 symlink
    - .gitconfig # 默认共享，可设为 isolated 排除
  copy_in: # init 时从 REAL_HOME 复制（一次）
    - .npmrc
  isolated: # 默认隔离（agent 自动创建）
    - .aws
    - .gnupg
    - .codex
    - .claude
    - .hermes

# Launch 行为
launch:
  permission_mode: default # default | accept-edits | plan
  effort: high # low | medium | high | max
  mcp_servers: [] # 显式 MCP server 列表（覆盖 settings.json）
```

### 2.4 managed vs auto-created vs semi-managed

| 文件/目录                       | 状态    | 何时创建           | 谁负责               |
| ------------------------------- | ------- | ------------------ | -------------------- |
| `meta.yaml`                     | managed | `agent-box create` | agent-box            |
| `home/.claude.json`             | managed | `create`           | agent-box（CC 陷阱） |
| `home/.claude/settings.json`    | managed | `create`           | agent-box            |
| `home/.claude/CLAUDE.md`        | managed | `create`           | agent-box            |
| `home/.claude/credentials.json` | managed | 首次 launch        | 用户（auth flow）    |
| `home/.claude/projects/`        | auto    | agent 运行时       | CC                   |
| `home/.claude/commands/`        | semi    | 用户可放           | 用户                 |
| `home/.codex/auth.json`         | managed | 首次 launch        | 用户（auth flow）    |
| `home/.hermes/config.yaml`      | managed | `create`           | agent-box            |
| `home/.hermes/hermes-agent/`    | auto    | pip install        | Hermes               |
| `home/.config/opencode/`        | auto    | agent 运行时       | OpenCode             |
| `home/.gitconfig`               | symlink | `create`（默认） | agent-box            |
| `home/.ssh/`                    | symlink | `create`（默认） | agent-box            |

### 2.5 Symlink 策略（D3 修订版）

- **`.gitconfig`**：默认 symlink 共享；meta.yaml 可通过 `shared.symlinks` 排除
- **`.ssh/`**：默认 symlink 共享；警告："profile 与 real HOME 共享密钥，跨 profile 切换需手动 `ssh-add`"
- **`.npmrc`**：默认不在 profile home 中，如需差异化配则 copy-in（init 时复制一次）
- 修改不同步
- **跨 UID 场景**：symlink 失效时自动降级为 copy-in + 警告
- **dangling symlink**：fail-fast，launch 中止并打印 `agent-box doctor` 建议

---

## §3 Launch Mechanism Design

### 3.1 进程模型（方案 C2：`os.execvpe`）

**为什么 C2**：

- PID 不变 / session 不变 / controlling tty 不变 → CC 的 / 命令、SIGWINCH、Ctrl+C 行为与直接运行 `claude` 完全等价
- MVP 阶段无需在子进程运行中观察 → C1 的 hook 优势无价值
- 退出码 100% 透传

**C2 限制承认**：Python 的 `atexit` / `finally` 块不会执行。Mitigation：所有清理工作必须在 `execvpe` 调用**之前**同步完成（profile 校验、sentinel 写入、buffer 清零、lint rule 禁止 exec 之后写任何代码路径）。

### 3.2 Launch 流程（伪算法）

```
agent-box launch <agent-type> <profile-name> [--resume [ID]] [--cwd DIR] [-- ...agent-flags]

1. 解析 args → (agent_type, profile_name, resume, cwd, agent_extra_args)
2. profile_lock(profile_name) 进入并发临界区
3. load_profile(profile_name) → meta
4. validate_profile(meta)  # 完整性检查
5. resolve_root() → AGENT_BOX_HOME
6. profile_home = AGENT_BOX_HOME / 'profiles' / profile_name / 'home'
7. ensure_managed_files(profile_home, agent_type)  # .claude.json 占位等
8. ensure_symlinks(profile_home, meta.shared.symlinks)  # 创建/修复
9. ensure_xdg_env()  # 重设 XDG_* 到 profile_home
10. env = os.environ.copy()
    env['HOME'] = str(profile_home)
    env['XDG_CONFIG_HOME'] = str(profile_home / '.config')
    env['XDG_DATA_HOME'] = str(profile_home / '.local' / 'share')
    env['CODEX_HOME'] = str(profile_home / '.codex')  # 显式覆盖
    env['AGENT_BOX_PROFILE'] = profile_name
    env['AGENT_BOX_AGENT'] = agent_type
    # 注入 API
    env[meta.api.api_key_env] = os.environ.get(meta.api.api_key_env, '')
    env['ANTHROPIC_BASE_URL' or 'OPENAI_BASE_URL'] = meta.api.base_url
    # 应用 env_overrides
    for k, v in meta.env_overrides.items(): env[k] = v
11. argv = build_argv(agent_type, resume, cwd, agent_extra_args)
12. assert os.isatty(0), "stdin must be tty for REPL mode (use -p for headless)"
13. print diagnostic to stderr if AGENT_BOX_DEBUG=1
14. os.execvpe(argv[0], argv, env)  # 进程替换，PID 不变
```

### 3.3 argv 构造（per agent）

```yaml
cc:      ['claude']                       + (['--resume', resume] if resume else []) + (['--continue'] if --continue else []) + (['--cwd', cwd] if cwd else []) + (['--permission-mode', mode] if mode else []) + agent_extra_args
codex:   ['codex']                        + (['resume'] if resume_no_id else []) + (['resume', resume] if resume_id else []) + (['--cd', cwd] if cwd else []) + (['--model', model] if --model else []) + agent_extra_args
opencode:['opencode']                     + ([cwd or '.']) + agent_extra_args
hermes:  ['hermes', 'chat']               + ([cwd] if cwd else []) + agent_extra_args
```

**关键设计**：

- `--` 分隔 agent-box 自己的 flag 与透传给 agent 的 flag（避免命名冲突）
- CC 的 `claude --profile NAME` 命名冲突：agent-box 不暴露 `--profile`，用 `agent-box cc <profile-name>` 替代
- agent 透传 flag 用 `sys.argv` 截取，不解析（避免 REMAINDER 静默吞参）

### 3.4 模式分流

| 模式             | 触发                          | 行为                                            |
| ---------------- | ----------------------------- | ----------------------------------------------- |
| **REPL**（默认） | stdin 是 tty 且无 `-p`        | 强制 `os.execvpe` + tty 检查 + signal 透传      |
| **Headless**     | `-p "PROMPT"` 或 stdin 非 tty | 允许走 `subprocess.run` 路径，输出可被 pipe/tee |

### 3.5 边界条件 & Edge Cases

| 场景                           | 处理                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| agent CLI 未安装               | 启动前 `shutil.which(argv[0])` 检查，缺失时打印 "install: `<cmd>`"                          |
| profile 不存在                 | 打印 `agent-box list` 建议 + 非零退出                                                       |
| meta.yaml 损坏                 | 打印 yaml 错误位置 + `agent-box validate <name>` 建议                                       |
| dangling symlink               | fail-fast + 打印 `agent-box doctor <name>` 修复命令                                         |
| `.claude.json` 缺失            | 自动 fallback 写入 `{"hasCompletedOnboarding": true}`                                       |
| 嵌套 tmux/SSH                  | SIGWINCH 透传由 C2 自然保证；MCP server 子进程 HOME 串味风险见 §6                           |
| macOS launchctl                | C2 不会改 PID，但 launchd 仍把 agent-box 当 job；CC 退出时 shell 退出触发 cleanup，**风险** |
| Windows WSL                    | Phase 1 仅保证 Linux/macOS；Windows 通过 WSL2 调用原生 Linux agent-box                      |
| 父 shell cwd 与 agent cwd 错位 | launch 时 `os.chdir(cwd)` 必须在 execvpe 之前                                               |
| agent-box 自身异常             | 全部异常走 stderr，退出码 1；execvpe 之后无 Python 异常可言                                 |

### 3.6 关键 env 注入清单

| env var               | 注入策略                    | 来源                              |
| --------------------- | --------------------------- | --------------------------------- |
| `HOME`                | 重设为 `profile_home`       | agent-box                         |
| `XDG_CONFIG_HOME`     | `profile_home/.config`      | agent-box（OpenCode 需要）        |
| `XDG_DATA_HOME`       | `profile_home/.local/share` | agent-box（OpenCode 需要）        |
| `CODEX_HOME`          | `profile_home/.codex`       | agent-box（防御性覆盖）           |
| `AGENT_BOX_PROFILE`   | profile name                | agent-box（agent 内部 hook 可读） |
| `AGENT_BOX_AGENT`     | agent type                  | agent-box                         |
| `ANTHROPIC_API_KEY`   | 从 real env 透传            | meta.api.api_key_env 解析         |
| `ANTHROPIC_BASE_URL`  | meta.api.base_url           | meta.yaml                         |
| `OPENAI_API_KEY`      | 从 real env 透传            | meta.api.api_key_env 解析         |
| meta.env_overrides.\* | 按字面量                    | meta.yaml                         |

---

## §4 CLI Design

### 4.1 命令结构

```
agent-box <agent-type> <profile-name> [options]
agent-box <subcommand> [args]
```

**两类 dispatch**：

- **主命令（launch 模式）**：`<agent-type> <profile>` 前两个 positional 触发 launch
- **子命令模式**：`create` / `list` / `show` / `edit` / `delete` / `validate` / `doctor` / `completion`

### 4.2 完整子命令清单

| 命令                                                                                        | 用途                                                         |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `agent-box cc <name> [--resume [ID]] [--cwd DIR] [--continue] [-p PROMPT] [-- ...cc-flags]` | 启动 CC                                                      |
| `agent-box codex <name> [--resume [ID]] [--cd DIR] [-- ...codex-flags]`                     | 启动 Codex                                                   |
| `agent-box opencode <name> [--cwd DIR] [-- ...opencode-flags]`                              | 启动 OpenCode                                                |
| `agent-box hermes <name> [--cwd DIR] [-- ...hermes-flags]`                                  | 启动 Hermes                                                  |
| `agent-box create <name> [--agent-type T] [--provider P] [--from-template T]`               | 交互式创建                                                   |
| `agent-box list [--json] [--agent-type T]`                                                  | 列出所有 profile                                             |
| `agent-box show <name> [--json]`                                                            | 显示 profile 详情                                            |
| `agent-box edit <name>`                                                                     | 用 `$EDITOR` 打开 meta.yaml + managed files                  |
| `agent-box delete <name> [--force]`                                                         | 删除 profile（保留 symlink 源）                              |
| `agent-box validate <name>`                                                                 | 校验 profile 完整性（symlink / managed files / yaml schema） |
| `agent-box doctor <name>`                                                                   | 修复 dangling symlink、补 `.claude.json`、检查权限           |
| `agent-box completion <shell>`                                                              | 输出 bash/zsh/fish 静态补全脚本                              |

### 4.3 错误处理

- **退出码**：0=成功，1=用户错误（profile 不存在），2=配置错误（meta.yaml 损坏），3=环境错误（agent CLI 未装），4=内部错误
- **错误信息格式**：`agent-box: <error_class>: <message>`，全部走 stderr
- **不静默吞错**：CC 的 `claude not found` 必须显式提示安装命令
- **suggestions**：错误信息后接 `try: agent-box <suggestion>`

### 4.4 Tab Completion（Phase 1 降级方案）

**承认**：B1 无 `--install-completion` 自动安装。Phase 1 用静态补全脚本：

```bash
# 用户主动 source
source <(agent-box completion bash)
# 或
agent-box completion zsh > "${fpath[1]}/_agent-box"
```

**补全内容**：

- 一级：`cc codex opencode hermes create list show edit delete validate doctor completion`
- 二级（launch 模式）：`<profile-name>` 列表（动态生成于 completion 调用时）

**不承诺**：

- 动态 profile 名在 shell 缓存期内可能过时
- 跨 profile 的 `agent-box` 上下文补全（如 profile 的 env_overrides key）不在 Phase 1 范围

**Phase 2 升级路径**：若 UX 反馈差，迁移到 Click（增加 ~150KB 依赖，1 天工作量）。

### 4.5 全局选项

| 选项         | 用途                                                          |
| ------------ | ------------------------------------------------------------- |
| `--version`  | 打印 agent-box 版本                                           |
| `--help`     | 帮助                                                          |
| `--home DIR` | 临时覆盖 `$AGENT_BOX_HOME`（不写 env）                        |
| `--debug`    | 打印 exec 前 argv + env diff 到 stderr（不污染 agent stdout） |
| `--no-color` | 禁用彩色输出                                                  |

---

## §5 Implementation Plan (Phase 1 MVP)

### 5.1 技术栈（方案 B1 修订版）

- **Python 3.9+**（从 3.11+ 降级，兼容 macOS 自带 3.9 / Debian 11 / RHEL 8）
- **tomllib 3.11+ 时用内置，3.9/3.10 用 `tomli`（仅 dev 依赖）** —— 实际上 MVP 不需要解析 toml，直接读 `config.toml` 文本即可
- **零运行时依赖**（除标准库）
- **dev 依赖**：`pytest` + `pytest-mock`（仅测试侧，不影响 runtime）
- **打包**：`pyproject.toml`（PEP 621）+ `hatchling` 构建后端
- **安装路径**：`pipx install agent-box` 或 `uv tool install agent-box`（**不推荐** `curl | python` —— macOS Gatekeeper / Windows Defender / PEP 668 拦截）

### 5.2 模块文件分解

```
/home/maoqh/projects/agent-box/
├── pyproject.toml                              # 包元数据 + hatchling 配置
├── README.md                                   # 用户文档
├── LICENSE                                     # MIT
├── src/agent_box/
│   ├── __init__.py                             # __version__
│   ├── __main__.py                             # python -m agent_box
│   ├── cli.py                                  # argparse 入口 + dispatch
│   ├── paths.py                                # resolve_root(), profile_home()
│   ├── profile.py                              # Profile dataclass + load/save meta.yaml
│   ├── profile_lock.py                         # flock 包装 + 跨平台 fallback
│   ├── doctor.py                               # 完整性检查 + 自动修复
│   ├── completion.py                           # 静态补全脚本生成
│   ├── errors.py                               # AgentBoxError 体系
│   ├── agents/
│   │   ├── __init__.py                         # AgentSpec 注册表
│   │   ├── base.py                             # AgentSpec ABC
│   │   ├── cc.py                               # ClaudeCodeSpec
│   │   ├── codex.py                            # CodexSpec
│   │   ├── opencode.py                         # OpenCodeSpec
│   │   └── hermes.py                           # HermesSpec
│   ├── commands/
│   │   ├── __init__.py
│   │   ├── launch.py                           # 主 launch 流程
│   │   ├── create.py                           # 交互式创建
│   │   ├── list.py
│   │   ├── show.py
│   │   ├── edit.py
│   │   ├── delete.py
│   │   ├── validate.py
│   │   └── symlinks.py                         # ensure_managed_files + ensure_symlinks
│   └── templates/
│       ├── cc/
│       │   ├── settings.json                   # 基础 CC settings
│       │   ├── CLAUDE.md                       # 空白角色 prompt 占位
│       │   └── claude.json                     # {"hasCompletedOnboarding": true}
│       ├── codex/
│       │   └── config.toml
│       ├── opencode/
│       │   └── config.json
│       └── hermes/
│           └── config.yaml
│
└── tests/
    ├── conftest.py                             # 临时 HOME fixture
    ├── test_paths.py                           # resolve_root 边界
    ├── test_profile.py                         # meta.yaml 序列化 + 校验
    ├── test_profile_lock.py                    # 并发锁
    ├── test_symlinks.py                        # opt-in + dangling 检测
    ├── test_launch.py                          # argv 构造（mock execvpe）
    ├── test_cli.py                             # argparse 端到端
    ├── test_doctor.py                          # 修复流程
    └── test_completion.py                      # 补全脚本生成
```

### 5.3 实施顺序（先跑通最小闭环）

1. **Day 1**：项目骨架（pyproject.toml、src/agent_box/**init**.py、cli.py 空入口）
2. **Day 2**：`paths.py` + `profile.py` + `errors.py` —— 解析 root、读写 meta.yaml
3. **Day 3**：`agents/base.py` + `agents/cc.py` —— AgentSpec 接口 + CC spec
4. **Day 4**：`commands/create.py` + `commands/symlinks.py` + `templates/cc/` —— 创建第一个 profile
5. **Day 5**：`commands/launch.py` + `profile_lock.py` —— **最小闭环可用**：`agent-box cc DW` 能起一个 CC
6. **Day 6**：`commands/list.py` + `commands/show.py` —— profile 可查
7. **Day 7**：`commands/edit.py` + `commands/delete.py` + `commands/validate.py` —— 完整 CRUD
8. **Day 8**：`agents/codex.py` + `agents/opencode.py` + `agents/hermes.py` —— 扩展 3 个 agent
9. **Day 9**：`commands/doctor.py` + `completion.py` —— 自愈 + 补全
10. **Day 10**：测试覆盖 + README + 第一次 `pipx install .` 自验

**MVP 验收标准（Day 10）**：

- `agent-box cc DW --resume` 在两台机器上能用同一份 profile
- `agent-box list` / `show` / `edit` / `delete` / `validate` / `doctor` 全部跑通
- 4 个 agent（CC/Codex/OpenCode/Hermes）都能 launch
- 95% 测试覆盖率（exclude `os.execvpe` 调用本身）
- `agent-box doctor` 能自动修复 dangling symlink 和缺失的 `.claude.json`

### 5.4 测试策略

**3 层测试**：

- **Unit（pytest）**：纯函数测试（路径解析、yaml 解析、argv 构造、lock 互斥）
- **Integration（pytest）**：mock `os.execvpe` 验证 env 构造和 argv
- **Smoke（手动）**：真实 launch CC/Codex，验证 tty 透传和 signal 行为

**关键 mock 点**：

- `os.execvpe` 替换为 `mock_execvpe(argv, env)` 记录调用
- `os.environ` 用 `monkeypatch` 隔离
- `subprocess.run` 不需 mock（agent-box 不走 subprocess）
- 真实 agent launch **不进 CI**（依赖外部 CLI）

**测试 fixture**：

- `tmp_home`：临时 HOME 目录
- `sample_profile`：预制 DW meta.yaml
- `clean_env`：清空所有 `AGENT_BOX_*` env vars

### 5.5 `agent-box doctor` 自动修复范围

1. 补齐缺失的 `.claude.json` onboarding 占位
2. 修复 dangling symlink（REAL_HOME 路径变了）
3. 修复 symlink 权限（600/700 不匹配）
4. 修复 `auth.json` / `credentials.json` 权限
5. 检测 meta.yaml schema 错误（version 字段缺失）
6. 提示 MCP server 路径冲突（见 §6）

### 5.6 配置文件 `.gitignore` 模板

`agent-box init` 时在 `${AGENT_BOX_HOME}/.gitignore` 写入：

```gitignore
# Profile metadata (managed by agent-box)
profiles/*/home/.claude/projects/
profiles/*/home/.codex/sessions/
profiles/*/home/.hermes/sessions/
profiles/*/home/.local/share/opencode/cache/
profiles/*/home/.claude/credentials.json
profiles/*/home/.codex/auth.json
profiles/*/home/.hermes/api_key.txt

# Caches
*.pyc
__pycache__/
.last_launch.jsonl
```

---

## §6 Open Questions / Decision Points

> 本节是 4 维对抗评审的合并。所有 verdict=revise 的方案已在 §1-§5 中吸收相应缓解措施；本节列出**未完全解决、需用户决策或 Phase 2 处理**的开放问题。

### 6.1 Critical / High 风险（必须解决）

| #   | 维度   | 风险                                                                                                                  | 缓解                                                                                                                               | 状态        |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| R1  | 启动   | `sudo -i` / `systemd --user` / `cron` / `tmux server` 中 `$HOME` ≠ `${AGENT_BOX_HOME}/profiles/<name>/home`，隔离失效 | launch 阶段强制 `os.environ['HOME'] == str(profile_home)` 检查，不匹配 abort + 打印 diff；提供 systemd `.service` 模板与 cron 用法 | 文档化      |
| R2  | 隔离   | `.ssh` symlink 导致多 profile 密钥身份串号                                                                            | 默认共享 symlink，meta.yaml 可显式改为 isolated；警告多 profile 需独立管理密钥                                      | §2.5 已定   |
| R3  | 隔离   | `.gitconfig` symlink 让多身份 `user.name/email` 冲突                                                                  | 默认共享 symlink；meta.yaml 提供 `git_config` 字段按 profile 覆盖 `user.name`/`user.email`                            | §2.3 已定   |
| R4  | 隔离   | CC `.claude.json` onboarding 共享破坏 per-profile 身份                                                                | `create` 时显式写入 profile_home/.claude.json，**不** symlink                                                                      | §1.2 已定   |
| R5  | 存储   | `AGENT_BOX_HOME` 指向 NFS/SMB/FUSE 时 `symlink(2)` 挂起或权限错乱                                                     | 启动前 `statvfs` 探测；探测到网络 FS 时降级为 copy-in                                                                              | 实施        |
| R6  | 存储   | profile 跨机器 rsync 后绝对路径 symlink 全部 dangling                                                                 | `agent-box doctor` 重新解析 `${REAL_HOME}` 重建 symlink                                                                            | §5.5 已定   |
| R7  | 存储   | 并发 `agent-box edit/create/delete` 同一 profile 写撕裂                                                               | 每个 profile 一个 `.lock` 文件，flock 包装                                                                                         | §2.2 + 实施 |
| R8  | 存储   | meta.yaml version 演进时旧 profile 缺字段 → `KeyError`                                                                | JSON Schema 校验 + `_migrate(from_version, to_version)` 链                                                                         | 实施        |
| R9  | 技术栈 | Python 3.11+ 门槛排除 macOS 自带 / 企业旧 Python                                                                      | 降到 3.9+，Codex toml 不用 tomllib 直接读文本                                                                                      | §5.1 已定   |
| R10 | 技术栈 | `curl \| python3` 安装被 Gatekeeper / Defender / PEP 668 拦截                                                         | README 黑体写「不要 curl \| python」，主推 `pipx`                                                                                  | §5.1 已定   |
| R11 | 启动   | `os.execvpe` 后 atexit/finally 失效导致 API key buffer 残留                                                           | 文档化约束 + lint rule 禁止 exec 后代码 + 清零 buffer 在 exec 前                                                                   | §3.1 已定   |
| R12 | 启动   | stdin 非 tty 误判导致 CC 进非交互模式                                                                                 | 启动前 `os.isatty(0)` 检查 + `-p` headless 分流                                                                                    | §3.4 已定   |
| R13 | 启动   | CC `-p` headless 模式下 `.claude.json` 状态被串味（projects/ jsonl 写到 profile_home）                                | 文档化此行为；提供 `--ephemeral` 临时 profile 选项（Phase 2）                                                                      | 文档化      |
| R14 | 隔离   | Codex `auth.json` 在 profile 内权限泄漏（profile_home 0700）                                                          | `create` 时强制 `chmod 0600`                                                                                                       | 实施        |

### 6.2 Medium / Low 风险（实施中或 Phase 2）

| #   | 维度 | 风险                                                                     | 状态                                                                          |
| --- | ---- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| R15 | 启动 | SIGWINCH 在三层嵌套（tmux → ssh → agent-box → claude）下传递断裂         | 文档化；C2 已最大化保证；Phase 2 验证                                         |
| R16 | 启动 | `agent-box cc DW \| tee log.txt` 彩色输出 / isatty 误判                  | 文档化；agent 自己处理                                                        |
| R17 | 启动 | pdb attach 在 C2 execvpe 下的 race window                                | 文档化；MVP 阶段 dry-run 模式足够                                             |
| R18 | 启动 | macOS launchctl 误杀 agent-box 关联进程                                  | 文档化；Phase 2 调查 launchd job 注销                                         |
| R19 | 隔离 | CC `projects/` 跨 profile 共享造成项目记忆污染                           | 提供 `shared_projects_pool` 显式 opt-in；默认隔离                             |
| R20 | 隔离 | OpenCode XDG 路径在 HOME 重定向后找不到 config                           | env 注入阶段显式覆盖 `XDG_CONFIG_HOME` / `XDG_DATA_HOME`                      |
| R21 | 隔离 | Hermes SQLite 数据库锁文件导致多 profile 串行失败                        | 文档化：每个 profile 独立 `.hermes/`，SQLite 锁不冲突                         |
| R22 | 隔离 | `.npmrc` copy-in 后 registry 漂移                                        | 文档化：`agent-box refresh <name>` 命令重新 copy-in                           |
| R23 | 隔离 | profile 间共享粒度（"只共享 ssh 不共享 gitconfig"）schema 不支持         | Phase 2：引入 `shared.selective` 字段；MVP 通过多 profile + 手动 symlink 兜底 |
| R24 | 存储 | meta.yaml version 字段演进                                               | JSON Schema 校验 + migration chain                                            |
| R25 | 存储 | macOS case-insensitive FS 上 `MyProfile` vs `myprofile` 冲突             | profile 名规范化（lowercase only）                                            |
| R26 | 存储 | 真实 HOME 下 `.ssh` 权限 700 + agent 进程 UID 不同导致 Permission denied | 启动前 `os.access` 检查；降级为 copy-in + 警告                                |
| R27 | 启动 | subprocess / 脚本包装调用时父进程 stdin 非 tty                           | 文档化 + 自动检测                                                             |
| R28 | 隔离 | CC 的 MCP server 子进程 HOME 串味                                        | 文档化为已知限制；Phase 2 让 MCP server 也走 agent-box launch                 |

### 6.3 真正的盲区（评审未完全覆盖）

| #   | 盲区                                                                          | 建议                                                                                              |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| B1  | **磁盘满 / inode 耗尽**：`create` 写模板时 ENOSPC/EDQUOT 失败回滚             | try/except + 临时目录清理 + 友好错误                                                              |
| B2  | **profile 间依赖与冲突**：两个 profile 同时 `npm install` 共享 `~/.npm`       | Phase 2：profile-level 互斥声明；MVP 文档化"避免同一 cwd 并发 launch"                             |
| B3  | **备份/快照 `.gitignore` 模板**已设计（§5.6），但缺 dotfiles 仓库接入指南     | README 增加"备份到 dotfiles 仓库"小节                                                             |
| B4  | **CC 的 `--profile NAME` 与 agent-box profile 同名冲突**                      | agent-box 不暴露 `--profile`，命令结构层面规避                                                    |
| B5  | **Windows 路径处理**：`pathlib` 在 WSL/MSYS/Cygwin 下行为诡异                 | Phase 1 仅保证 Linux/macOS；Windows 通过 WSL2 调原生 Linux agent-box；Phase 3 再考虑 Windows 原生 |
| B6  | **Codex `resume` 是 interactive picker vs CLI 参数**：pipe 模式下 picker 崩溃 | 文档化：必须 tty；或用 `resume <id>` 跳过 picker                                                  |
| B7  | **测试覆盖度统计**：MVP 缺 codecov 集成                                       | CI 阶段接入 codecov                                                                               |
| B8  | **CI 与发布**：`pipx install` 流程未在 CI 跑通                                | GitHub Actions：lint + test + build wheel                                                         |
| B9  | **国际化**：错误信息英文硬编码                                                | MVP 英文 + 中文双语；Phase 2 引入 i18n                                                            |
| B10 | **安装后的 welcome banner** 未设计                                            | Phase 1 简单 banner；Phase 2 交互式 onboarding                                                    |

### 6.4 Phase 2 / 3 待办（不阻塞 MVP）

- tmux layout 集成（`agent-box multi-launch <layout.yaml>`）
- NiceGUI Web GUI（profile editor + session browser）
- Session history tracking（SQLite + FTS5）
- Import/export profiles（`agent-box pack <name> | unpack`）
- Knowledge-base MCP sharing layer（`shared_projects_pool` 扩展）
- `--ephemeral` 临时 profile（用 tmpfs，退出后销毁）
- Windows 原生支持
- 完整 tab completion（迁移到 Click 或 `shtab`）
- i18n（gettext）
- 自动更新检查

### 6.5 给用户的决策请求

> 以下 3 项需要在实施 Day 1 之前确认，否则按 §2-§5 建议方案执行：

1. **`AGENT_BOX_HOME` 默认值**：`~/.agent-box/`（建议）还是 `~/Library/Application Support/agent-box/`（macOS 习惯）？
2. **license 选择**：MIT（建议，最大兼容性）还是 Apache-2.0（专利明确）？
3. **Python 最低版本**：3.9（建议，最大兼容）还是 3.11（用 tomllib 内置，省 tomli）？

---

## 附录 A：用户最关键的三件事

1. **CC 的 `$HOME/.claude.json` 陷阱必须在 `create` 时显式预写** —— 不解决这个，`agent-box cc DW` 每次都会重新进入 onboarding，所有"profile 隔离"承诺瞬间崩塌。
2. **D3 共享策略必须 opt-in，不能默认 symlink 任何身份相关文件** —— 默认 symlink `.ssh` / `.gitconfig` 会直接破坏"多身份隔离"的核心价值（用户切到 oss profile，git push 用了 dw profile 的公司邮箱）。
3. **C2 启动机制意味着 Python 进程在 `execvpe` 那一刻消失** —— 所有清理、密钥 buffer 清零、sentinel 写入必须在 `execvpe` 之前同步完成，且必须有 lint rule 禁止 exec 之后写任何代码路径，否则一次 exec 后留下孤儿文件就是安全事故。
