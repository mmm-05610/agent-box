# Work Order 42 — 交付、等待与真实模型验收进度

日期：2026-09-14。本轮零泄漏：任何证据、日志、命令行参数均不含凭据内容；
已发生的1次可达性请求由后端受控进程读取仓库外 locator，未把内容写入仓库或输出。
受管 Harness 的 SecretStore→Worker 投影尚未执行，不以计划中的注入路径冒充已验事实。

## 2026-09-14 12:15 +08:00 — 28 方法 wire 重锁

- 前端提交：`3aba5c5c8743401b964f80c88bd43e847fa3d5a8`；writer lease 仍 ACTIVE，未接管前端。
- 双方摘要：TS `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`；生成工件
  `5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`。
- 后端对该实际工件严格回归 `29 passed in 67.57s`，队列终态差异关闭，状态
  `WIRE_LOCKED_FOR_IMPLEMENTATION`。
- 尚未进入全栈联调；下一后端门是 Windows r4 重确认。真实模型调用数与费用无变化：累计1次、
  12 tokens、<¥0.01。

## A — 前端只读观察与 wire 增量协作

后端在41收口期间按42-A同等写权约束做只读检查（未写前端任何文件、未杀其进程、未发第二个 goal）：

- 工作树 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1`，2026-09-14 12:15 +08:00
  实际 HEAD `3aba5c5c8743401b964f80c88bd43e847fa3d5a8`；writer 正在 P04 下一切片，工作树非 clean。
- 其自身 status：`frontend_implementation=PARTIAL`（P00/P01 GREEN、P02 A/B1/B2/C/D、
  P03纵切1–2和 P07 28方法增量已提交；P03生产调用者及 P04–P06待续），
  `writer_lease=ACTIVE — Codex frontend goal`（09:20 接管），
  尚未达到 `DESKTOP_IMPLEMENTATION_READY`。
- 前端已消费核心维护与队列终态反馈，并在同一 wire 提交 Session/history 28方法增量及
  completed/failed/cancelled 编码。后端对实际生成工件 29/29 回归通过，双方摘要已锁定；
  无需用户逐字段批准。

## B — 双门判定（**均未满足，故未进入联调**）

| 门 | 判定 | 依据 |
| --- | --- | --- |
| BACKEND_IMPLEMENTATION_READY | **否（暂时）** | 28方法+队列终态已锁定并29/29；只待串行Windows r4重确认 |
| DESKTOP_IMPLEMENTATION_READY | **否** | 前端自报 PARTIAL，且 `writer_lease=ACTIVE`（未释放）；独立实现/验收门未完 |

因此仍**没有**记录 `FULLSTACK_INTEGRATION_OWNER`，**没有**接管前端工作树，
**没有**启动跨端链路。这是纪律要求，不是进度不足的借口。

## C — 无模型联调

未进入（依赖 B 的双门）。

## D — 真实模型授权与逐家验收（**进行中，1 家证伪，其余待验**）

授权：仅 DeepSeek 官方 API，全轮累计 ≤ ¥10；凭据 locator 见工单 §D。

### 已完成

1. **凭据 locator 校验**：目录 0700 / 文件 0600、长度 35、`sk-` 前缀（只读元数据，
   未打印内容）。未读取其他凭据、未读取旧 37 密钥或任何登录态。
2. **官方 API 可达性（有界最小调用）**：`POST https://api.deepseek.com/chat/completions`，
   `model=deepseek-chat`，`max_tokens=8`。返回 HTTP 200，内容 `ok`，
   usage `{prompt_tokens: 11, completion_tokens: 1, total_tokens: 12}`。
   **这是 API 可达性证据，不是 Harness 验收**。
3. **Codex 家：协议不兼容（证伪）**。用受支持的 Provider 配置
   （`$CODEX_HOME/config.toml` 定义 `model_providers.deepseek`，`base_url` 指向
   DeepSeek 官方、`env_key=DEEPSEEK_API_KEY`）驱动内嵌 Codex 0.147.0：

   ```text
   session/new → error -32603 "Internal error"
   data: "failed to reload config: .../config.toml:8:12: `wire_api = \"chat\"` is no longer
   supported. How to fix: set `wire_api = \"responses\"` in your provider config."
   ```

   即该 Codex 版本只接受 **OpenAI Responses API** 形状，而 DeepSeek 官方提供的是
   chat-completions 形状。按 42-D「协议不兼容则记录该家待验，不私建模型代理」处理：
   **Codex 家与 DeepSeek 官方 API 当前不兼容，标记该家真实模型待验**。
   未修改 Codex 工件、未搭建任何代理、未换用其他凭据。
   注意：这不影响 Codex 的组件门（40-C 已通过）；它只说明该家无法用本轮授权模型做真实闭环。

### 未完成

- Pi / Hermes / OpenCode 三家的真实模型验收：每家的 Provider/Model 配置尚未完成
  （需要各自的 provider 配置结构与模型目录对齐）。本轮未执行、未用组件结果冒充。
- 42-D 的「UI 选择角色 → 首次发送 → 终止前内容 → 继续一轮 → 关闭重开恢复历史」
  完整链路依赖 42-B 双门，未执行。

### 费用账（累计）

| 项 | 调用数 | 用量 | 估算费用 |
| --- | --- | --- | --- |
| DeepSeek 官方 API 可达性检查 | 1 | 12 tokens（11 in / 1 out） | < ¥0.01 |
| Codex 真实模型尝试 | 0 次模型调用 | 0（在 `session/new` 阶段即失败，未发起模型请求） | ¥0 |
| **合计** | **1** | 12 tokens | **< ¥0.01 / 上限 ¥10** |

未预留、未充值。若后续继续，建议按 8 元停止新增测试留结算余量（工单建议）。

## E — 最终验收与提交

未执行（依赖双门与真实门）。41 的25方法/Windows基线检查点为 `72d6258`；当前28方法收口待提交。
更早检查点见 status：
`b84dc87`(39) → `38b28d6`(40-A) → `05053f9`(40-B) → `340fcad`(40-C) → `b70cd3f`(40-D)
→ `7e9ffd8`(41) → `8eeb422`(42-A 观察) → `978918d`(sidecar 桥)。
未 push、未 merge、未 force、未改动发布源或用户真实数据。
