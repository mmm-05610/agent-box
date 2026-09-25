# agent-box-terminal-session — 资源包说明（MB-1c）

> 状态＝**物理包**（独立 `pyproject.toml` + `src/` + `tests/` + entry point + console script）。
> 锚＝P 树 `c1360f3` · 组 P · 2026-09-22T06:5xZ

## 职责
- TerminalSession 两适配器：**direct-stdio**（`DirectStdioResourceProvider`/`DirectStdioSession`）与 **tmux**（`TmuxResourceProvider`/`TmuxSession`/`TmuxRespawnOperationHandler`/`TmuxIdentity`）。
- 释放语义：direct-stdio `release` 回 `{released,destroyed,managed}`（`direct_stdio.py:82-87`，`managed` 恒真并自陈）；tmux managed `release` 先 `has-session` 探针（`check=False`，`:206-207`）、重复释放 no-op 不抛、补偿全 best-effort 不顶替原失败（P-T4/D16 修毕）、borrowed 永不杀。
- attempt 重放守卫（`AttemptLedger`）；bridge console script `agent-box-terminal-session-bridge`（`bridge:main`）。

## 非职责
- 不做会话内容/输出的持久权威（会话状态归 Server 侧）；不做沙箱/git/skills 语义；不杀 borrowed 会话；不做 per-agent 分支（6 号零命中）。

## 公开接口（`__all__`）
`TerminalSessionV1` · `DirectStdioResourceProvider` · `DirectStdioSession` · `TmuxResourceProvider` · `TmuxRespawnOperationHandler` · `TmuxSession` · `TmuxIdentity`（＋`TerminalAdapterError`、selectors、`submit_direct`、`safe_token_file`、`bridge_command`、`create_plugin`）。
Entry point：`terminal_session = agent_box_terminal_session.plugin:create_plugin`；console script 见上；provider_id 由 descriptor 承载 `terminal-session`。

## 依赖
- 对核心**单向**：`agent_box.extensions`（runtime_composition.TerminalSessionV1/TransportOperationContribution）、`agent_box.work_core`。
- 跨插件依赖＝**0**；外部可执行＝`tmux`（tmux 面）、spawn 的 stdio 程序；pyproject 依赖 `pacthold==2.0.0a1`。

## 测试命令
```bash
PYTHONPATH="src:$(ls -d plugins/*/src | tr '\n' ':')" <venv>/bin/python \
  -m pytest plugins/agent-box-terminal-session/tests -q -p no:cacheprovider
```
实测：**23 passed / 0 failed**（5 文件）。

## 已知缺口（登记不展开，随板 §D）
- 非判别钉：`test_terminal_session_p0.py:74` 用 `pytest.raises(Exception)`（r31 登记，词表收敛不可见）。
- `agent-box-sandbox-windows` 的无主 `IsolatedProcessSpec` 引用与 `cleanup->bool` 归属（r21/msg.20）——**属 windows 插件、不在六件**，随 windows 清理卡。
