# agent-box v2 — bwrap 隔离方案 MVP Spec

## 核心变化

v1 用 HOME 环境变量覆盖 → CC 用 `os.userInfo().homedir` 绕过 → 部分隔离失败
v2 用 bubblewrap bind mount → 内核 VFS 层替换 `~/.claude/` → 100% 隔离

## Profile 结构

```
~/.agent-box/
├── template/                        # 基础模板（init-template 生成）
│   ├── dot-claude/
│   │   ├── settings.json            #     空 env，保留 plugins/theme/marketplaces
│   │   ├── settings.local.json      #     {} 空
│   │   ├── commands/                #     空目录
│   │   └── skills/ → symlink ~/.claude/skills  # 共享基础 skills
│   └── dot-claude.json              #     {} 空 mcpServers
│
└── profiles/<name>/
    ├── meta.yaml                    #     name, agent_type, provider
    ├── dot-claude/
    │   ├── settings.json            #     从 template 复制 + 注入 provider 配置
    │   ├── settings.local.json      #     从 template 复制
    │   ├── CLAUDE.md                #     角色 prompt
    │   ├── commands/                #     从 template 复制（空）
    │   ├── skills/ → symlink ~/.claude/skills  # 共享
    │   └── projects/                #     CC 自动维护
    └── dot-claude.json              #     从 template 复制
```

## 命令

```
agent-box init-template              # 从真实 ~/.claude/ 抽取通用部分生成 template
agent-box create <name> [--provider deepseek|minimax|anthropic]
agent-box list [--json]
agent-box cc <name> [--cwd DIR]
agent-box delete <name>
agent-box show <name>
```

## `init-template`

1. 创建 `~/.agent-box/template/dot-claude/` 目录
2. 从真实 `~/.claude/settings.json` 复制，清除 `env` 块、`permissions`、清除 `_marker`，保留 `enabledPlugins`、`extraKnownMarketplaces`、`theme`、`outputStyle`、`autoCompactThreshold`、`hooks` 等通用配置
3. 创建空 `settings.local.json` = `{}`
4. 创建空 `commands/` 目录
5. 创建 `skills/` symlink → `~/.claude/skills`
6. 创建 `dot-claude.json` = `{}`
7. 输出成功

## `create <name> [--provider]`

1. 校验 name（无 `/` `\` 空格，不以 `.` 开头）
2. 如果 template 不存在，自动调用 `init-template`
3. 复制 `template/dot-claude/` → `profiles/<name>/dot-claude/`
4. 复制 `template/dot-claude.json` → `profiles/<name>/dot-claude.json`
5. 创建 `profiles/<name>/dot-claude/skills/` symlink → `~/.claude/skills`
6. 按 provider 注入 `settings.json` 的 `env` 块：

| provider  | ANTHROPIC_BASE_URL                   | ANTHROPIC_MODEL     |
| --------- | ------------------------------------ | ------------------- |
| deepseek  | `https://api.deepseek.com/anthropic` | `deepseek-v4-pro`   |
| minimax   | `https://api.minimaxi.com/anthropic` | `MiniMax-M2.7`      |
| anthropic | (empty, 用默认)                      | `claude-sonnet-4-6` |

默认所有 tier model 同主模型。API key 留 `sk-REPLACE_ME`。API_TIMEOUT_MS=3000000，CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1。

7. 写 `CLAUDE.md` = `# <name> agent profile`
8. 写 `meta.yaml`：

```yaml
name: <name>
agent_type: cc
provider: <provider>
```

9. 输出成功 + 下一步提示

## `list [--json]`

遍历 `profiles/` 目录，读 `meta.yaml`，列表输出。

## `cc <name> [--cwd DIR]`

1. 校验 profile 存在、`dot-claude/` 目录完整
2. 读取 `meta.yaml`、`settings.json` 的 env block
3. 如果 `--cwd DIR`：先 `os.chdir(DIR)`
4. 调用 bwrap：

```
bwrap \
  --bind / / \
  --bind <profile_root>/dot-claude /home/<user>/.claude \
  --bind <profile_root>/dot-claude.json /home/<user>/.claude.json \
  --dev /dev \
  --proc /proc \
  --tmpfs /tmp \
  --unshare-all \
  --share-net \
  claude
```

5. API key 从 settings.json env block 注入进程环境变量（bwrap 传递）
6. 如果 bwrap 不存在，报错提示安装

## `delete <name>`

确认后 `rm -rf profiles/<name>/`

## `show <name>`

显示 meta.yaml 内容 + provider 信息

## 文件结构

```
src/agent_box/
├── __init__.py
├── cli.py              # argparse, main()
├── config.py           # AGENT_BOX_HOME, paths
├── profile.py          # create, list, delete, show, init_template
├── launch.py           # bwrap command construction + execvpe
└── providers.py        # provider 配置数据
```

## 约束

- Python 3.9+，零依赖（stdlib only）
- `os.execvpe("bwrap", ["bwrap", ...], env)` 替换进程（CC 继承 PID/tty）
- bwrap 是系统依赖，非 Python 依赖
- 不读/写真实 `~/.claude/` 的任何文件（init-template 是只读）
- 不使用数据库

## 验收

```bash
agent-box init-template              # 生成 template
agent-box create decision --provider deepseek
agent-box create dw --provider minimax
agent-box list                       # decision + dw
agent-box cc decision                # bwrap 启动，/model → ds-v4-pro
agent-box cc dw                      # 另一个终端，/model → MiniMax-M2.7
agent-box delete decision            # 清理
```
