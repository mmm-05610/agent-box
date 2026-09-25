# C 调研：真实测试请求上界与逐请求计数（budget-request-bounds v1，2026-09-23）

依 BUDGET.md"必须诚实处理99次"：C 在开任何真实测试批前必须查明 Harness 自动重试/多步工具循环能否设**可验证请求上界**或**逐请求计数**。仅有轮次/工具数不足以证明 API 调用次数；无可验证上界不得开批。本文件为该调研的中央账，真实测试批文将引用本结论。

## 1. 计数单位定义（本任务口径）

- 计数对象＝**被测 Harness 进程向上游模型 API 发出的实际请求次数**（含自动重试、工具循环中的每次调用），非用户 prompt 数、非 BE wire 消息数、非 turn 数。
- 一次"真实测试请求"（预算扣减单位）＝一个测试批内可归属的、有证据的上述请求集合；ledger 按 grant 记录实际次数与证据路径。

## 2. 候选证据源（已核事实）

| 源 | 能证明什么 | 局限 | 状态 |
|---|---|---|---|
| BE wire `usage.updated` 帧（13 事件 kinds 之一，projection.py:27,58）＋session 级 `latest_usage`（tokens only，:166-189） | 会话级 token 用量、帧时间线 | **tokens≠请求数**；帧按事件到达计，一次 turn 内多次上游调用是否各发一帧未证 | 佐证源 |
| BE `raw_events` 逐 session 持久化＋`history.snapshot` 分页（S 表 §5/§8） | 测试后完整回放事件序列（可审计） | 同上，非请求计数 | 佐证源 |
| Harness CLI 自身会话日志/协议（Pi agent_settled、Codex app-server token_count 类事件） | 最接近上游调用的观察点；可能含每 turn 用量与重试记录 | **是否暴露请求级计数/重试次数未证**——候 H 三件套报告 | 关键缺口 |
| CLI 配置面（max-turns/retry 上限类旗标或配置） | 若存在＝可设**硬上界** | 是否存在未证——候 H 报告对照官方文档 | 关键缺口 |
| 测试任务设计（单轮、无工具、短输出） | 把每请求集合压到最小；配对"事件帧数 vs 预期"可发现异常重试 | 不能证明"恰为 1 次"，只能证"≤ 上界"可信度 | 控制手段 |

## 3. 拟定真实测试批协议（v1 草案，批文时正式化）

1. 开批前置（缺一不开）：H 报告给出每 Harness 的请求可观测源＋（若有）重试/轮次上界配置；C 据此在 ledger grant 写明"计数依据"。
2. 每条测试用例：单目的 prompt；测前记 cursor 基线，测后取 `raw_events` 回放＋Harness 日志核对；两者一致才记账。
3. 上界声明：grant 写明"本批最大实际请求数=N"与计数依据；实际>M 或证据不一致→停批并记录 UNKNOWN，不得当免费重试续跑。
4. luna 指定：Codex 批每请求显式 gpt-5.6-luna，证据=请求参数侧记录（连接器/测试配置侧，非 UI——C-011 第 5 点）；Pi 原样配置不动。
5. 隔离：测试专用启动配置放 `/home/maoqh/.config/ordessa-testing/hd001/`（0700/0600，最小化）；只清理登记的本任务进程/端口。

## 4. 开放项（候 H 报告，逐项闭合后才可开真实测试批）——2026-09-23 更新（依 H harness-pi-codex-feasibility.md）

- [x] Codex 显式 luna 机制确认：codex-acp@1.1.14 经 `CODEX_CONFIG` 合并 session config、`MODEL_PROVIDER` 选 provider，显式模型可行（官方文档对照 §5）；deploy/codex/config.toml env_key 用法有官方依据。
- [x] key 注入路径确认：MemorySecretStore+locator import_file（G2 裁决，HD-001-C-013），不建持久 store。
- [x] 协议面：ACP v1 标准能力与基线消费逐一对应，无自造协议。
- [ ] **Pi/Codex 上游请求级计数与重试留痕仍未见直接证据**（feasibility 报告未覆盖）——首个真实测试批（B-HARNESS-PI-001 R2 真实轮/CODEX luna 轮）签发前，须由 H/门脚本给出计数依据（或该轮按单轮无工具设计+回放对账构成 ≤上界证据并如实登记"非精确计数"），否则该批缓行。
- [ ] CP4 审批场景先行 Codex（C-013 第 4 条）不影响计数口径；真实轮的 ledger 记录按本 §3 协议执行。

## 5. 结论（v1）

- 计数框架与协议已备；**可验证上界的最终判定候 H 报告闭合 §4**。在此之 前 `real_calls_enabled` 维持 false，任何真实测试批不签发。
- 本调研不消费预算、不读密钥、不启动任何进程。
