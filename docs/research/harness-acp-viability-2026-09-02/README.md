# Harness ACP Viability Research — 2026-09-02

只读产品研究知识库：审计 Agent Client Protocol（ACP）能否成为 Agent-Box 五个 Harness
（Codex / Claude Code / OpenCode / Hermes / Pi）的首选实时会话协议。**本轮未修改任何产品
代码、未实现 ACP、未执行 Git 写操作、未发起真实模型请求、未读取任何 credential 内容。**

- 基线：branch `feat/resource-routing-phase2` @ `1a3c3083`（dirty worktree 成果未被触碰）
- 观察日期：2026-09-02；环境：WSL2 x64 Linux
- 证据政策：[SOURCE_POLICY.md](SOURCE_POLICY.md)（来源分级 / 六类事实分离 / 脱敏 / 状态词）

## 1. 总 Verdict

> **否决 ACP-primary。** Agent-Box 可以保留现有 Harness planning/governance 链，同时引入
> ACP 作为 vendor-native Harness 的**第二 launch mode**与未来 Registry 对象的**主协议**；
> 但把五个必选 Harness 的运行阶段统一切到 ACP、native 降为兜底，今天不成立。

三个决定性依据：

1. **厂商原生 ACP 在五家里只有两家**：OpenCode（`opencode acp`，2025-10-20 起内建）与
   Hermes（`hermes acp`，in-tree acp_adapter）。Codex/Claude 只有协议组织第三方 adapter
   （质量高但非厂商，与厂商 CLI 双源漂移），Pi 厂商明拒 ACP（earendil-works/pi#175）。
2. **fidelity P0 损失**：usage/cost 在 codex/pi/hermes 的 ACP 面残缺；Claude `result`
   聚合帧 9 字段（含 structured_output）无出口；Codex `--output-schema`/审批治理收窄。
   与 Agent-Box 的 usage 记账、structured output、explicit Finish 证据链直接冲突。
3. **协议空白**：无 durable replay/reconnect（v1 明文"implementer's responsibility"）、
   permission 无超时、capability 协商存在实证的 silent no-op（Codeg：subagents/plan_update
   因 schema 无 catch-all 而静默失效）。

采纳：**Option D（per-Harness fixed choice）**——每家固定最成熟协议并允许声明第二
launch mode；AcpSessionDriver 作为 HarnessSessionDriver 家族的一员进入 Harnesses 插件。
详见 [AGENT_BOX_INTEGRATION_OPTIONS.md](AGENT_BOX_INTEGRATION_OPTIONS.md) 与
[FINAL_ADMISSION_DECISIONS.md](FINAL_ADMISSION_DECISIONS.md)。

## 2. 决策速览

| Harness | 决策 | ACP 实现 | 厂商原生 | 拓扑裁决 | 复杂度 | confidence |
|---|---|---|---|---|---|---|
| Codex | NATIVE_PRIMARY | codex-acp 1.8.0（ACP org） | 否 | SAFE_WITHIN_EXISTING_RUNTIME（附条件） | S~M | HIGH |
| Claude Code | NATIVE_PRIMARY | claude-agent-acp 0.73.0（ACP org/Zed 起源） | 否 | REQUIRES_RUNTIME_CHANGE | L | HIGH |
| OpenCode | NATIVE_PRIMARY（ACP 第二模式最廉价） | vendor 内建 `opencode acp` | **是** | SAFE | S | HIGH |
| Hermes | ACP_OPTIONAL | vendor 内建 `hermes acp` | **是** | SAFE | S | HIGH |
| Pi | NATIVE_PRIMARY | pi-acp 0.0.33（个人社区件） | 否（明拒） | REQUIRES_RUNTIME_CHANGE | M-H | HIGH |
| Gemini/Qwen/Grok（辅助） | ACP_PRIMARY（未来 registry 对象模板） | vendor 原生 | **是** | SAFE | S | 高/高/中 |

## 3. 知识库结构

| 文件 | 内容 |
|---|---|
| [SOURCE_POLICY.md](SOURCE_POLICY.md) | 证据来源政策、六类事实分离、实验边界、脱敏 |
| [ACP_PROTOCOL_CAPABILITY_MATRIX.md](ACP_PROTOCOL_CAPABILITY_MATRIX.md) | 协议本体 27 项矩阵 + 规范空白 R1-R7（stable v1 / v2 alpha draft；stdio 唯一 stable transport；三轨版本独立） |
| [ACP_IMPLEMENTATION_IDENTITY_MATRIX.md](ACP_IMPLEMENTATION_IDENTITY_MATRIX.md) | 每家 ACP 实现身份 + F1-F6 六类事实逐项判定 |
| [CODEG_ACP_RUNTIME_ARCHAEOLOGY.md](CODEG_ACP_RUNTIME_ARCHAEOLOGY.md) | Codeg 全链路 file:line 考古（spawn→dispatch→seq→broadcast→前端 reducer；13 问归属；复用/不复用清单） |
| [PROCESS_TOPOLOGY_AND_SANDBOX_MATRIX.md](PROCESS_TOPOLOGY_AND_SANDBOX_MATRIX.md) | 进程拓扑、双 spawn 八问、沙箱/credential 风险、kill/reap 兜底 |
| [STREAMING_PERMISSION_CONTINUATION_MATRIX.md](STREAMING_PERMISSION_CONTINUATION_MATRIX.md) | 逐家能力矩阵 + permission 无限等待 / 续接三梯子 / silent no-op 实证 |
| [NATIVE_VS_ACP_FIDELITY_MATRIX.md](NATIVE_VS_ACP_FIDELITY_MATRIX.md) | ACP 相对现有 native 接口的 P0/P1/P2 损失清单 |
| [AGENT_BOX_INTEGRATION_OPTIONS.md](AGENT_BOX_INTEGRATION_OPTIONS.md) | Option A/B/C/D 十四维比较与判定（B 不可行、C 是伪装的 B、推荐 D） |
| [RECOMMENDED_SESSION_DRIVER_ARCHITECTURE.md](RECOMMENDED_SESSION_DRIVER_ARCHITECTURE.md) | HarnessSessionDriver/AcpSessionDriver/ObservationHub 边界与十项设计判断 |
| [FINAL_ADMISSION_DECISIONS.md](FINAL_ADMISSION_DECISIONS.md) | 每家最终裁决 + pin 配方 + 今天可实施的最小范围 |
| [EXPERIMENT_LOG.md](EXPERIMENT_LOG.md) | 本轮全部只读实验与不执行清单 |
| [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) | 15 项未决问题（UNKNOWN 登记） |

每 Harness dossier：`harnesses/<id>/{ACP_FACTS.md, EVIDENCE.md, candidate-acp.toml}`
（codex / claude-code / opencode / hermes / pi 完整；gemini-cli / qwen-code / grok-build
为 AUXILIARY 缩减版并单独标注证据等级）。原始笔记：`research-notes/`；合成实验：
`experiments/`（fake ACP peer，全部 PASS，无 credential 无模型请求）。

## 4. 与上一轮（harness-native-knowledge-2026-09-01）的关系

- 引用其 FACTS 作为 native 基准（只读，未改动）；修正其一处过期事实：OpenCode 官方
  repo 已从 sst/opencode 301 重定向到 anomalyco/opencode（2026-09-02 观察）。
- Hermes 上一轮 UNRESOLVED #1（PyPI 发布状态）本轮确认：0.19.0 已发布（200）。
- claude/codex 的"非官方 adapter"表述升级为：**agentclientprotocol 协议组织官方 adapter、
  仍非 Harness 厂商官方**（Zed 名下两仓库已整体移交，npm 旧包 deprecated 重定向）。

## 5. 验收清单（本轮）

- [x] 五个必选 Harness 完整 dossier（ACP_FACTS/EVIDENCE/candidate-acp.toml）
- [x] 官方 SDK 与 Harness-specific implementation 全程分离（F1-F6 逐项）
- [x] Codeg 链路 file:line（CODEG_ACP_RUNTIME_ARCHAEOLOGY.md）
- [x] 每项 ACP 能力均有出处或 UNKNOWN
- [x] stable v1 / experimental v2 明确（协议矩阵）
- [x] 每家 wrapper/native process topology + sandbox/credential 风险明确
- [x] native fidelity 损失明确（P0/P1/P2）
- [x] 每家 admission decision + Option A/B/C/D 对比 + ACP-primary 总判决
- [x] 8 份 candidate-acp.toml 全部通过 tomllib 解析（21 必填字段）
- [x] `git diff --check` 通过；未修改产品代码；未执行 Git 写操作；未执行模型请求；未读取 credential
