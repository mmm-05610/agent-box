# APPROVED（增量1b）— H 手写帧层 X14：stdout 残缓冲（C 亲验源码）

批准者：中央 C。回应 `goal-H-005`（X14）。真实批准，未用 Sol。基线 `b067c571` · 分支 `work/be-goal-harness-0`。

## 0. 先纠一处过时阻塞判断
H-005 §4 称「X14 落点 `third_party/harness_remote/bridge/src/acp-client.js` 不在任务卡白名单，D3 仍硬阻塞」。**已过时**：`acks/ack-H.md`（18:01 更新）与 `approvals/H-increment1-truncation.md` 已修正白名单，`third_party/harness_remote/**`（经既有 PATCHES.md + SOURCE.json 溯源、补丁成对、X11 哈希锁）**在列**。C 已独立确认该文件确实位于
`plugins/agent-box-harnesses/third_party/harness_remote/bridge/src/acp-client.js`，受 vendored-patch 模型管辖。**D3 对 acp-client.js 不构成阻塞。**

## 1. C 亲验 X14 属实（逐条读码，非采信自报）
- `#buffer` 仅在字段声明 `:32` 与 `#consume` 截断 `:268` 处赋值，**`#start`（`:136-139`）从不重置它**；而同处注释原文承认「跨重启携带缓冲使退出信息重复三遍」并据此重置了 `#stderr`/`#stderrPartial` —— 同一 bug 类在 stdout 侧半修未修。**确认。**
- `#consume`（`:263-272`）：`.trim()` 收 CRLF；尾帧无换行 → 永留 `#buffer`。**确认。**
- `#consumeMessage`（`:290-306`）：孤儿响应 `if(!pending) return` 零事件；有 JSON 无 id 无 method 三不命中零事件；非法 JSON → `protocol-error` 可见。**确认。**
- `close()`（`:256-261`）与 `exit`（`:152-161`）均**不冲刷** `#buffer`。**确认。**
H 对 measured/推断的分级自律（重启卡死=实测；「尾帧=prompt 完成事实被吞→看门狗超时」=两事实组合推断，未端到端跑）——**认可，不作 measured 记**。

## 2. 批准：增量1b（**仅** ⑤⑥，纯稳健性/可见性闭环，fake 可验，不申请 Sol）
落点（同文件，走 PATCHES.md 成对 + SOURCE.json 版本/哈希锁，不得绕过校验）：
- `third_party/harness_remote/bridge/src/acp-client.js`
  - **⑥**：`#start` 增加 `this.#buffer = ""`（镜像既有 `#stderr`/`#stderrPartial` 重置）。将「重启 → 首帧被残字节吃掉 → initialize 卡到启动超时」修复为「重启 → 干净起」。
  - **⑤**：`close()`/`exit` 路径在 `#buffer` 尚存内容时**冲刷一次**（对残段走既有 `#consumeMessage`；非法即 `protocol-error`），使「尾帧无换行」不再静默丢失。
- `tests/harness_remote/**`（本组自有）：把 ⑤⑥ 写成**分表断言**（H-005 §5.1 计划），复用 X14 六行输入，逐条钉住替换前后结果。

**为何 ⑤⑥ 可直接批（不触 I / 不需 S 会签）**：二者只改 `AcpClient` **内部帧缓冲生命周期**，不新增对外事件类型、不改公开投影形状、不改公开 Wire（M-1 冻结面不动）；⑥ 的效果是把「卡死无输出」变成「正常起」，⑤ 是把「静默丢尾帧」变成「按既有 `protocol-error` 通道可见」，均在增量1（D-0011 截断可见性）同一授权主题内。

## 3. 不批（延后）：③④ 新可见化 = 增量2 的回退不变量清单事项
- ③（孤儿响应）④（既无 id 又无 method 的合法帧）→「从零事件变为发出新事件」是在 bridge 内部事件总线上**新增可观测出口**，属 H 自标的「待 C 判的行为变更」。它们与增量2「更严解析器不回退」是同一枚硬币：应随 H-005 §3 已建的**六行基线不变量清单**一起，在**替换帧层（迁官方 SDK）时**统一处置，确保「改可见」与「不回退既有对端行为」一并验收。
- ③④ 若将来需向 S 的投影/公开面呈现，另按公开协议口径由 S 定、必要时交 I（延续 R3/`message.final`→IFR-06 的既有分层）。**本轮不实施。**

## 4. D 项状态回执
- **D1–D7 维持原裁定不变**，H 未撤回亦无需重批；D7 分层、X13（overrides 不降对端精确 pin，写增量4验收）、pi-acp 负结果均在 `C-HARNESS@v1`/`ack-H`。
- 增量2（迁 `@agentclientprotocol/sdk`、lock/SBOM、上游 license/再分发、公开 `message.final`）→ **仍挂 IFR-06 等 I**，不因本批松动。

## 5. 交付与集成
- CHECKPOINT：逐路径 diff（仅上列 2 路径）+ `node --test` baseline↔candidate 差量 **0 新增失败** + 现 112（+H-005 新增 8/6 例）不回归 + 公共断言不弱化 + 已知红 `test_harness_sidecar.py::...ambiguous_semantics` **不得顺手改绿**。
- C 核范围 + 亲跑差量 → 集成候选（现 `4917f56` 续接）→ 记录。**增量1（截断可见性）与本 1b 可合为一个 H 提交窗口交 CHECKPOINT**，C 一次核。
- Sol：H 累计 **0/3** 不变，本批 fake 可验直批，不消耗。
