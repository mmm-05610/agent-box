# agent-box v2 — bwrap bind mount MVP

## 核心变化

v1 HOME 覆盖 → v2 bwrap bind mount。内核 VFS 层替换 `~/.claude/`，100% 隔离。

## Profile 结构

```
~/.agent-box/
├── template/                              # 基础模板（init-template 生成）
│   ├── dot-claude/
│   │   ├── settings.json                  #   空 env，保留 plugins/theme/marketplaces
│   │   ├── settings.local.json            #   空 {}
│   │   ├── CLAUDE.md                      #   空
│   │   ├── commands/                      #   空目录
│   │   └── skills/                        #   (预留，默认不创建)
│   └── dot-claude.json                    #   空 mcpServers, hasCompletedOnboarding: true
│
├── profiles/
│   └── <name>/
│       ├── meta.yaml                      #   name, agent_type: cc, provider
│       └── dot-claude/                    #   从 template 复制
│           ├── settings.json              #   已注入 provider 配置
│           ├── settings.local.json        #   空
│           ├── CLAUDE.md                  #   角色 prompt
│           ├── commands/                  #   空
│           └── projects/                  #   (CC 自动创建)
│       └── dot-claude.json               #   空 mcpServers
```

## 命令

```
agent-box init-template             # 一次性：从真实 ~/.claude/ 抽取通用模板
agent-box create <name>             # 从 template 复制 → 注入 provider 配置
agent-box list                      # 列出所有 profile (name agent_type provider)
agent-box cc <name> [--project DIR] # bwrap 启动
agent-box delete <name> [--force]   # 删除 profile
```

## create 流程

1. 创建 `profiles/<name>/` 目录
2. `cp -r template/dot-claude/ profiles/<name>/dot-claude/`
3. `cp template/dot-claude.json profiles/<name>/`
4. 写 `meta.yaml`：name, agent_type: cc, provider
5. 根据 provider 注入 settings.json 的 env：
   - deepseek → `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`, `ANTHROPIC_MODEL=deepseek-v4-pro`
   - minimax → `ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic`, `ANTHROPIC_MODEL=MiniMax-M2.7`
   - anthropic → `ANTHROPIC_BASE_URL=https://api.anthropic.com`, `ANTHROPIC_MODEL=claude-sonnet-4-6`
   - API key 留空占位 `sk-REPLACE_ME`，用户手动填
6. 写 `CLAUDE.md` = `# {name}\n\n`
7. 确保 settings.json 中 `ANTHROPIC_DEFAULT_HAIKU/SONNET/OPUS_MODEL` 与主 model 一致
8. 创建空 `settings.local.json` = `{}`
9. 打印成功 + 提示填 API key

## init-template 流程

1. 检查 `~/.claude/settings.json` 存在
2. 提示用户：这会从真实配置抽取通用模板，API key 等敏感数据会被清除
3. 复制 `~/.claude/settings.json` → 清除 env 块、permissions 块、hooks 块 → 保留 plugins/theme/marketplaces/misc
4. 复制 `~/.claude.json` → 清除 mcpServers 块 → 保留 hasCompletedOnboarding
5. 创建空的 `settings.local.json`、`CLAUDE.md`、`commands/`
6. 打印成功

## launch 流程 (bwrap)

```bash
bwrap \
  --bind / / \
  --bind ~/.agent-box/profiles/<name>/dot-claude ~/.claude \
  --bind ~/.agent-box/profiles/<name>/dot-claude.json ~/.claude.json \
  --dev /dev \
  --proc /proc \
  --tmpfs /tmp \
  --unshare-all \
  --share-net \
  claude [--cwd <project-dir>]
```

使用 `subprocess.run`（不用 `os.execvpe`，因为 bwrap 是 wrapper，CC 是它的子进程）。

## Provider 配置模板

| Provider  | ANTHROPIC_BASE_URL                   | ANTHROPIC_MODEL     |
| --------- | ------------------------------------ | ------------------- |
| deepseek  | `https://api.deepseek.com/anthropic` | `deepseek-v4-pro`   |
| minimax   | `https://api.minimaxi.com/anthropic` | `MiniMax-M2.7`      |
| anthropic | `https://api.anthropic.com`          | `claude-sonnet-4-6` |

## 错误处理

| 场景            | 输出                                                                   |
| --------------- | ---------------------------------------------------------------------- |
| profile 不存在  | `agent-box: <name>: profile not found. agent-box list`                 |
| bwrap 未安装    | `agent-box: bubblewrap not installed. sudo apt install bubblewrap`     |
| CC 未安装       | `agent-box: claude not found`                                          |
| template 不存在 | `agent-box: template not initialized. agent-box init-template`         |
| 无效 provider   | `agent-box: unknown provider. Supported: deepseek, minimax, anthropic` |

## 代码结构

```
src/agent_box/
├── cli.py              # argparse 入口
├── config.py           # 路径常量 + AGENT_BOX_HOME
├── profile.py          # create, list, delete, write meta.yaml
├── template.py         # init-template
├── launch.py           # bwrap + subprocess
└── providers.py        # provider 配置表
```

## 约束

- Python 3.9+，零依赖
- `subprocess.run`（不是 os.execvpe — bwrap 是 wrapper）
- agent-box 旧 v1 profile 不管兼容
- 不需要数据库
- 不需要 `home/` 子目录，直接 `dot-claude/`

## 验收

```bash
agent-box init-template                  # 生成 template/
agent-box create DW --provider minimax  # 创建 mw profile
agent-box create decision --provider deepseek  # 创建 ds profile
agent-box list                           # DW / decision
agent-box cc DW                          # bwrap 启动，/model 显示 MiniMax-M2.7
agent-box cc decision                    # bwrap 启动，/model 显示 deepseek-v4-pro
agent-box delete DW --force              # 删除
```
