# agent-box 架构笔记

## 设计原则（来自对话）

1. **零外部依赖** — stdlib only，sqlite3 是标准库，bwrap 是系统工具
2. **模板是常量，不是文件** — 内置在 library.py，clone 即用
3. **library.db 只存覆盖值** — 模板常量做底，user_overrides 压上
4. **不碰项目目录** — `cd` 是 shell 的事，agent-box 只管启动
5. **Provider 切换 = 全覆盖** — apply_provider 整体替换 env 块，不是合并
6. **和 cc-switch 的关系** — 模板数据来源于 cc-switch 预设，但不依赖它运行

## 数据流

```
_BUILTIN_PROVIDERS (Python 常量, 完整 env, key="")
        ↓ 无 seed，直接读
user_overrides (library.db, 只存 key 等覆盖值)
        ↓ get_provider = 模板 + 覆盖值合并
profile settings.json env 块 (apply_provider 写入)
        ↓ build_child_env 继承系统 env + 叠加 settings env
bwrap 子进程 env
        ↓ execvpe
Claude Code
```

## 当前架构

```
agent-box/
  cli.py        — 8 个命令（cc/create/list/show/edit/config/test/component）
  launch.py     — bwrap argv 构建 + execvpe
  profile.py    — profile CRUD + apply_provider + 配置读写
  library.py    — 内置模板 + 内置 provider + user_overrides 表 + CRUD
  config.py     — 路径工具
  edit.py       — $EDITOR 启动器
  providers.py  — 旧 3 个 provider（回退用）
```

## bwrap 参数（WSL2 兼容）

```
--unshare-ipc --unshare-pid --unshare-uts  ← 不用 --unshare-all（WSL2 断网）
--share-net                                  ← 共享网络，代理/直连都正常
--bind / / --dev /dev --proc /proc --tmpfs /tmp
```
