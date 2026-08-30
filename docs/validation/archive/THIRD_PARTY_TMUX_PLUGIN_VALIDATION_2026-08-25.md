# 第三方 tmux 插件真实验证（2026-08-25）
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md) · [插件 ADR](../adr/0007-third-party-provider-plugin-loading.md)

## 结论

状态：**READY**

一个不属于 `agent-box-cli` 主包的 Python distribution 已通过标准
`agent_box.plugins` entry point 被自动发现，并让自己的 Contract 和
ResourceProvider 参与真实 Work Core Dispatch。Agent-Box 源码中没有 tmux 分支，
数据库也没有新增 tmux 或插件字段。

## 独立安装

验证使用隔离 target，避免依赖仓库 import 路径伪装成插件发现：

```bash
python3 -m pip install \
  --no-deps --no-build-isolation \
  --target /tmp/agent-box-tmux-plugin \
  ./plugins/agent-box-tmux

PYTHONPATH=/tmp/agent-box-tmux-plugin:$PWD/src \
  python3 -c 'from agent_box.cli import main; main(["plugins", "list", "--json"])'
```

发现结果：

```json
{
  "id": "tmux",
  "version": "0.1.0",
  "status": "READY",
  "contracts": ["agent-box-tmux.console@1"],
  "resource_providers": ["tmux-console"]
}
```

## 真实 ResourceProvider

- binary：`/usr/bin/tmux`
- version：`tmux 3.4`
- actual session ID：`$0`
- actual pane IDs：`%0`、`%2`、`%1`
- pane 数量：3
- create / command projection / cleanup：成功

第一次运行失败于 `can't find window: 0`。原因是本机 tmux 配置改变了 window base
index，插件错误假设首个窗口固定为 `0`。修复后使用 session target，不再依赖用户
窗口编号配置；第二次运行成功。

## 完整 Core Dispatch

路径：

```text
installed distribution entry point
→ PluginRegistration
→ dynamic Contract + ResourceProvider registry
→ frozen (agent-box-tmux.console@1, console-spec ArtifactRef)
→ ResourceProvider.resolve
→ TmuxConsoleV1 type validation
→ ExecutionProvider.start
→ accepted Dispatch
```

输入使用 ArtifactRef 是刻意的：freeze 时 native tmux session 尚不存在；实际 `$0`
只能在物化后作为 native SessionRef 记录，不能把预定 session name 冒充 native ID。

一次实际运行产生：

- Execution：`exec_b2301ee8bc554f7c9f3bbe0f692823a0`
- Dispatch：`dispatch_24878cb6b9f64b06bf3d1b6d469908d3`
- Dispatch state：`accepted`
- console-spec ArtifactRef digest：`sha256:6374324530d129ad8aa9118babd8dbcad8791009560f5dd3a01047f38e0917dd`
- inputs digest：`015ba0d3c1c679ae4e528eb112037401b2ccf34094da75ea95164704665d4419`
- native SessionRef：`$0`
- provider correlation：`tmux:$0`

这些 ID 只记录本次 spike，不作为稳定 fixture。

## 自动化验证

```text
tests/test_extensions.py                                      5 passed
plugins/agent-box-tmux/tests/test_tmux_provider.py            1 passed
目标 Work Core/Contract/real-provider/Codex tests            29 passed
全仓库                                                        244 passed, 1 skipped,
                                                               2 environment failures
```

全仓库两个失败都来自宿主 `~/.agent-box` SQLite/history 在当前受限环境只读，发生在
既有 GUI RPC parity tests；与插件、registry、Contract 或 tmux 改动无关。

## 后续补充：Codex 显式消费已实现

`agent-box-tmux` 继续负责 console resource 的 identity/materialization，并新增一组
tmux 产品专属操作：race-free pane launch、pane observation、scrollback capture 和
cleanup。`agent-box-codex` 注册的 `codex-tmux-interactive` ExecutionProvider 显式消费
`TmuxConsoleV1`，负责 Codex TUI launch、SessionStart correlation、观察和显式 Finish。

这没有形成通用 console protocol，也没有给 Core 增加 pane、participant、terminal
或 process lifecycle 语义。OpenCode/Hermes 或未来 Team provider 仍需各自实现明确的
tmux 消费；出现第二种真实 console 产品后再评估共同协议。
