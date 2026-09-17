# Work Order 49 — 证据卫生（evidence hygiene）报告

结果：**EVIDENCE_HYGIENE_DONE**（详见未做项一节；Windows r4 的 C/D 真实模型段按零真实模型约束不复跑，属记账而非通过）。

执行时间：2026-09-17。工作树 `/home/maoqh/projects/agent-box-env-provider`，分支 `feature/env-provider-v1`。

## G1 缺省即失败（九个门逐门）

改动：八个 `*-production-chain-gate.py`（pi/hermes/opencode/codex/kilo/claude/dsh/qwen）与
`runtime-artifact-gate.py` 的 `--worker` 默认值全部从写死的 bundle 路径改为 `None`；
缺省时在创建任何临时状态之前以类型化码 `GATE_WORKER_REQUIRED` 非零退出，错误消息列出
盘上现存的 bundle 目录名（动态枚举，不写死"现行"名字）。kilo/claude/dsh/qwen 家保留
`AGENTBOX_W43_WORKER` 环境变量作为显式指定途径；八家 production-chain 门统一接受该变量。

逐门缺参实跑（2026-09-17，HEAD 见 G4）：

| 门 | 退出码 | 类型化码 |
| --- | --- | --- |
| pi | 1 | GATE_WORKER_REQUIRED |
| hermes | 1 | GATE_WORKER_REQUIRED |
| opencode | 1 | GATE_WORKER_REQUIRED |
| codex | 1 | GATE_WORKER_REQUIRED |
| kilo | 1 | GATE_WORKER_REQUIRED |
| claude | 1 | GATE_WORKER_REQUIRED |
| dsh | 1 | GATE_WORKER_REQUIRED |
| qwen | 1 | GATE_WORKER_REQUIRED |
| runtime-artifact | 1 | GATE_WORKER_REQUIRED（reason 字段） |

反例测试：`tests/server/test_gate_worker_defaults.py`，2 passed（0.52s，缺参路径不创建临时状态）。
逐门断言非零退出 + 类型化码 + 消息含 bundle 清单。

同类排查结论：
- `accept-e.ps1`：`$ManifestPath` 本就是 `Mandatory = $true`，无写死默认，不改。
- `host-substitution-gate.py`：`--artifact` 为 `required=True`，无 worker 默认，不改。
- `accept-b.ps1`/`accept-c.ps1`/`accept-d.ps1`：ManifestPath 为必填参数，无写死默认。
- 44–48 新增的门（`env-provider-gate.py`、`native-home-gate.py`、`harness-install-set.py`、
  `all-harnesses-coexistence.py`、`all-harnesses-isolation-gate.py`）：grep 无任何
  `acceptance-bundle` 写死引用，不改。

## G2 显式现行 bundle 复跑

Linux 侧：pi 全链门（假端点）显式 `--worker workers/agent-box-worker/.acceptance-bundle-c8/agent-box-worker`，
exit 0，`PI_PRODUCTION_CHAIN_GATE_OK`，
`worker.sha256 = sha256:ce7fdeb298eee100ca025ba56ba75b49758df0953b3219c2a038ec9575178ffb`。

**摘要记账**：工单所写 c8 摘要 `514f48a9…` 已不是现行值。c8 目录在 45/46 执行期间被重建
（Worker control protocol 4 + 审计帧上限调整），现行摘要即上行 `ce7fdeb2…`。c8 的重建
各自有其工单内的证据（45 的 G 门、46 的 UI 门），本单不改写那段历史。

Windows 侧（零真实模型约束下的部分复跑）：
- accept-b 段（Windows HTTP→WSL Worker 全链，无模型）用显式 c8 复跑：
  `SERVER_WSL_R1_B_WINDOWS_HTTP_OK`，exit 0，
  `worker_digest = sha256:ce7fdeb2…`，Unicode+空格 workspace 浏览通过，持久化 1 workspace
  （DataRoot `AgentBox\acceptance-49-b`，端口 18749）。
- r4 的 C/D 段是真实模型段，49 是零真实模型工单，**不复跑、不记通过**；r4 全套在 46 期间
  已有用当时 bundle 的完整 exit 0 证据（windows-r4c9/ 目录）。

## G3 status 口径

`docs/implementation/status.md` 顶部新增"计数口径（工单 49）"一节：
- 现行计数仅一条：根套件 + 插件套件 + Rust，各自带范围、命令、HEAD 三要素；
- 文件中其余全部历史计数一律以该节声明为准（"凡非本节标注的计数均为历史，已被取代"），
  原文不改写（保留历史条目的原始事实与措辞）。

## G4 回归计数（范围 + 命令 + HEAD）

- HEAD：本单实现提交（见 git log "49: gate defaults refuse omission"；其上为 docs 同步
  3474177 / ac114e3）。说明：本次回归运行时工作树包含本单的门脚本改动与 45 遗留的未提交修复
  （Worker 审计帧上限 64KiB→1MiB、home.list 审计超时 120s、audit 元数据竞态容忍），
  这些修复随本单之后的提交收口，已在 G4 计数中一并验证。
- 根套件（范围 `tests/`）：命令
  `PYTHONPATH=src:plugins/agent-box-harnesses/src:plugins/agent-box-runtime-wsl/src:plugins/agent-box-runtime-local/src:plugins/agent-box-sandbox-bwrap/src:plugins/agent-box-skills/src:plugins/agent-box-terminal-session/src python3 -m pytest tests/ -q`
  → **601 passed / 0 failed / 0 skipped**（183s，完整重跑；首次运行曾 4 errors，根因是
  debug Worker 二进制旧于源码的既有卫生断言，`cargo build` 后 8/8 通过，与门改动无关）。
- 插件套件（范围 `plugins/agent-box-harnesses/tests/`）：命令
  `PYTHONPATH=… python3 -m pytest plugins/agent-box-harnesses/tests/ -q`
  → **195 passed / 3 skipped / 0 failed**（与 46 期间计数一致）。
- Rust（范围 `workers/agent-box-worker`）：命令 `cargo test --locked --release`
  → **38 passed / 0 failed**（46 期间曾为 27 passed；其后的协议审计上限与元数据竞态改动带新增测试）。
- 与工单基线 605/3 的关系：本单删除了 `legacy_codex.py` 及其两个测试文件
  （47 §2.E 收口项，两个文件合计 7 个用例：608 − 7 = 601，数目吻合），根套件计数变化来自该
  删除与 45/46 期间的合法增量，非本单行为退化；门的行为除"缺参"外不变（G1/G2 复跑佐证）。

## G5 仓务与证据保留

- `git worktree prune`：两个 prunable 条目（agent-box 主仓的 work-core-runtime /
  work-core-self-use-demo 注册项）已清理；prune 后 `git worktree list` 无 prunable 残留。
  prune 只清理失效的 worktree 注册元数据，未删除任何工作树内容。
- bundle 目录现状：`workers/agent-box-worker/` 下现存
  `.acceptance-bundle-c4`、`.acceptance-bundle-c8`、`.acceptance-bundle-c9`、
  `.acceptance-bundle-musl` 四个目录。**本单未删除任何 bundle。**
  **差异记账**：工单写时"c2–c8 七个目录都在盘上"；49 开工时 c2/c3/c5/c6/c7 已不在本工作树
  （bundle 不入 git，删除时点无法追溯，非 49 行为）。c4 与 c8/c9 的历史证据地位不变。
- legacy_codex 收口（47 §2.E，由本单提前完成）：删除
  `src/agent_box/server/legacy_codex.py`（423 行）+ `tests/server/test_stage_c_codex.py`
  （499 行）+ `tests/server/test_stage_c_windows_wsl_offline.py`（140 行）；全仓引用仅此两个
  测试，无生产引用。已在 47 工单文档 E 节登记"已由工单 49 提前完成"。
- `git diff --check`：干净。

## 未做项与阻塞项

1. Windows r4 的 C/D 真实模型段未用 c8 复跑——49 零真实模型约束；非阻塞，记账处理。
2. 其余七家全链门（hermes/opencode/codex/kilo/claude/dsh/qwen）未在显式 c8 下逐家复跑——
   工单 G2 只要求"至少一家"；它们的缺参失败已由 G1 逐门覆盖。
3. c2/c3/c5/c6/c7 目录缺失的时点不可追溯——bundle 不受 git 跟踪；如验收需要可对照
   父工作树与备份归档核对。
