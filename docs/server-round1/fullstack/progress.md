# Work Order 42 — 交付、等待与真实模型验收进度

日期：2026-09-14。本轮零泄漏：任何证据、日志、命令行参数均不含凭据内容；
密钥只经进程环境变量传给受管 Harness 投影，且未写入任何文件或输出。

## A — 后端完成后的前端只读等待

按 42-A 做了一次只读检查（未写前端任何文件、未杀其进程、未发第二个 goal）：

- 工作树 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1`，HEAD `91305d86`
  （其后 `df848380`、`5c0fbfe1`）。
- 其自身 status：`frontend_implementation=PARTIAL`（P00/P01 GREEN、P07 检查点 1–2、
  P02A GREEN、P02B1 待提交；B/C/D 待施工），
  `writer_lease=ACTIVE — Codex frontend goal`（09:20 接管），
  `CONTRACT_CLIENT_READY=否`（wire 未锁定）。
- wire 交换经 [wire-review.md](../wire-review.md) 进行；后端已按其候选实现并请其确认
  3 项机械差异与登记摘要，等待答复。

## B — 双门判定（**均未满足，故未进入联调**）

| 门 | 判定 | 依据 |
| --- | --- | --- |
| BACKEND_IMPLEMENTATION_READY | **否** | 41 终态为 PARTIAL：41-E Windows 真机段未做（本会话在 WSL2 Linux 内）；经 WSL Worker 的部署接线未完成（仅在本地进程启动器上验证 Server→sidecar→fake Harness） |
| DESKTOP_IMPLEMENTATION_READY | **否** | 前端自报 PARTIAL，且 `writer_lease=ACTIVE`（未释放），wire 未锁定 |

因此**没有**记录 `FULLSTACK_INTEGRATION_OWNER`，**没有**接管前端工作树，
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

未执行（依赖双门与真实门）。已提交的后端检查点见 status：
`b84dc87`(39) → `38b28d6`(40-A) → `05053f9`(40-B) → `340fcad`(40-C) → `b70cd3f`(40-D)
→ `7e9ffd8`(41) → `8eeb422`(42-A 观察) → `978918d`(sidecar 桥)。
未 push、未 merge、未 force、未改动发布源或用户真实数据。
