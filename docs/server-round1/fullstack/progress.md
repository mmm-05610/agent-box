# Work Order 42 — 交付、等待与真实模型验收进度

日期：2026-09-14。本轮零泄漏：任何证据、日志、命令行参数均不含凭据内容；
已发生的1次可达性请求由后端受控进程读取仓库外 locator，未把内容写入仓库或输出。
受管 Harness 的 SecretStore→Worker 投影尚未执行，不以计划中的注入路径冒充已验事实。

## 2026-09-14 12:44 +08:00 — 模型冻结与秘密投影代码检查点

- `502f4b5` 将 Profile 的模型引用解析为包含 ProviderModel id/version、provider、model、credentialId
  和非敏感配置的不可变 execution 投影；排队项继续持有同一对象摘要，后续 ProviderModel 更新不会
  改写已接受工作。
- 生产 sidecar 装配在派发时才把 credentialId 解析到 SecretStore；内容只经 Worker `secret.put`
  进入一次性帧，并固定只读挂载到隔离内。adapter 只收到部署声明的环境名，模型进入原生
  `create`/`prompt`；正常关闭、启动拒绝和 Worker 终态均安排秘密清理。
- 定向验证：Server/wire 相关 45 passed，Worker/bwrap 32 passed，Node envelope 4 passed；其中新增
  5 个冻结、kind mismatch、argv 非泄漏和启动异常清理反例。没有读取真实 locator、没有模型或网络
  请求，累计费用仍为 1 次/12 tokens/<¥0.01。
- 此检查点只证明接线与组件生命周期。Pi/Hermes/OpenCode 的原生运行时工件/配置进入生产 bwrap
  以及逐家真实模型门仍需完成；Windows r4 也尚未运行，后端状态不提前升级。

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

## D — 真实模型授权与逐家验收（**进行中，四家待验**）

授权：仅 DeepSeek 官方 API，全轮累计 ≤ ¥10；凭据 locator 见工单 §D。

### 已完成

1. **凭据 locator 校验**：目录 0700 / 文件 0600、长度 35、`sk-` 前缀（只读元数据，
   未打印内容）。未读取其他凭据、未读取旧 37 密钥或任何登录态。
2. **官方 API 可达性（有界最小调用）**：`POST https://api.deepseek.com/chat/completions`，
   `model=deepseek-chat`，`max_tokens=8`。返回 HTTP 200，内容 `ok`，
   usage `{prompt_tokens: 11, completion_tokens: 1, total_tokens: 12}`。
   **这是 API 可达性证据，不是 Harness 验收**。
3. **Codex 家：保留错误配置失败，撤回协议不兼容结论。** 先前 Provider 配置
   （`$CODEX_HOME/config.toml` 定义 `model_providers.deepseek`，`base_url` 指向
   DeepSeek 官方、`env_key=DEEPSEEK_API_KEY`）驱动内嵌 Codex 0.147.0：

   ```text
   session/new → error -32603 "Internal error"
   data: "failed to reload config: .../config.toml:8:12: `wire_api = \"chat\"` is no longer
   supported. How to fix: set `wire_api = \"responses\"` in your provider config."
   ```

   这只能证明 Codex 0.147.0 拒绝过时的 `wire_api="chat"`，不能证明 DeepSeek 官方服务不支持
   Responses。用户提供的 DeepSeek 官方 `codex-deepseek-setup.sh` 1.3.0（2026-09-14 只读取得
   SHA-256 `0a3a33704e1fb1579300d559f009279c7db8e06aa428a0cba07ac9e265a130ca`）明确配置
   `base_url="https://api.deepseek.com/"` 与 `wire_api="responses"`，并提供完整模型目录。
   因此撤回“协议不兼容/证伪”结论；原错误与零模型调用事实保留。目前正在 AgentBox 隔离 Profile
   中按官方配置验证，不执行该脚本、不修改用户真实 `~/.codex`、不建设协议代理。

### 未完成

- Pi / Hermes / OpenCode 三家的真实模型验收：无模型配置与有界 runner 已在 `bc7d95b` 完成，
  `502f4b5` 完成生产 sidecar 的冻结/秘密投影基础；原生运行时封装及付费验证尚未完成。本轮仍未执行、
  未用组件结果冒充。
- 42-D 的「UI 选择角色 → 首次发送 → 终止前内容 → 继续一轮 → 关闭重开恢复历史」
  完整链路依赖 42-B 双门，未执行。

### 费用账（累计）

| 项 | 调用数 | 用量 | 估算费用 |
| --- | --- | --- | --- |
| DeepSeek 官方 API 可达性检查 | 1 | 12 tokens（11 in / 1 out） | < ¥0.01 |
| Codex 错误 chat 配置尝试 | 0 次模型调用 | 0（在 `session/new` 阶段即失败，未发起模型请求） | ¥0 |
| **合计** | **1** | 12 tokens | **< ¥0.01 / 上限 ¥10** |

未预留、未充值。若后续继续，建议按 8 元停止新增测试留结算余量（工单建议）。

## E — 最终验收与提交

未执行（依赖双门与真实门）。41 的25方法/Windows基线检查点为 `72d6258`；当前28方法收口待提交。
更早检查点见 status：
`b84dc87`(39) → `38b28d6`(40-A) → `05053f9`(40-B) → `340fcad`(40-C) → `b70cd3f`(40-D)
→ `7e9ffd8`(41) → `8eeb422`(42-A 观察) → `978918d`(sidecar 桥)。
未 push、未 merge、未 force、未改动发布源或用户真实数据。
