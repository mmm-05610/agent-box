# agent-box-runtime-local — 资源包说明（MB-1c）

> 状态＝**物理包**（独立 `pyproject.toml` + `src/` + `tests/` + entry point，可独立安装与单跑）。
> 锚＝P 树 `c1360f3`（＝候选 `a4ab628` 的 P 面同内容）· 组 P · 2026-09-22T06:5xZ

## 职责
- 本机 Linux RuntimeHost 的**精确适配器**：进程宿主身份、本地路径 token、宿主传输操作（`LocalHostTransport`）。
- 执行资源的**获取与释放语义**：spawn token 三本账（`_paths`/`_envs`/`_consumed`，`provider.py:140`）、`release()` 回收绑定（`:181`，**`_consumed` 是重放守卫本身、有意不裁剪** `:184`）、`cleanup()` 清理族回执＋加性 `reclaimed` 计数（`:296-308`）。
- 诊断面＝`bounded-diagnostics`（`plugin.py:39`），finish＝`finish-is-host-coordinated`。

## 非职责
- 不做沙箱/终端/git/skills/artifacts 任何一者的语义；不碰 Profile、凭据内容、公共 wire。
- 不做 ssh/远程 host（P-6 延期，板 §D）；不做 per-agent 分支（边界检查 6 号零命中）。

## 公开接口（`__all__`）
`LocalRuntimeHostProvider` · `LocalRuntimeHost` · `LocalHostTransport`（＋包内 `LocalPathToken`、`LocalRuntimeHostDiagnostics`、`LocalRuntimeHostSelector`、`create_plugin`）。
Entry point：`runtime-local = agent_box_runtime_local.plugin:create_plugin`。

## 依赖
- 对核心**单向**：`agent_box.extensions`（协议/Plugin API）、`agent_box.work_core`（Ref/registry）。
- 跨插件依赖＝**0**（1 号检查）。
- pyproject 运行依赖：`pacthold==2.0.0a1`（六件同）。

## 测试命令
```bash
PYTHONPATH="src:$(ls -d plugins/*/src | tr '\n' ':')" <venv>/bin/python \
  -m pytest plugins/agent-box-runtime-local/tests -q -p no:cacheprovider
```
实测（权威 `.venv` 3.12.14/pytest 9.1.1）：**19 passed / 0 failed**（3 文件、19 函数）。

## 已知缺口（登记不展开，随板 §D）
- **D9b**：`_consumed` 有意不裁剪 ⇒ 长跑单 host 的无界诉求须另立「保持拒绝语义的裁剪策略」设计决定（CP-P-T3 定案）。
- **P-6 ssh provider**：本轮不接收（延期）。
- transport 回收仅绑「消费那一刻」，干净拒绝不回收——是批准语义非缺陷（P-T3）。
