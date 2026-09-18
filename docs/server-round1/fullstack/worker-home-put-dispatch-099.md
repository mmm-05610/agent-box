# 099 — Worker 的 `home.put` 从未接上分发线

日期：2026-09-18　执行者：env-provider 工作树　基线：`ace4ecd`
关联：本单由 **086 阶段 2 的第一手失败**投递；影响 58（资产）与 65（委派桥）。

事实分级：**实测**＝本轮亲手跑出来；**引用**＝读到源码/账本原文；**未验证**＝推断，不当结论用。

## 1 实测：一发即死

跑 086 阶段 2 的真实链路（真 Server + uvicorn + 真 Worker 二进制 + 真 bwrap + 真 claude CLI）：

- 播种轮（beta，**零授予** ⇒ 无资产文件）：**completed**。
- 父轮（alpha，授予 beta ⇒ 65 的桥被渲染成 `.claude.json` 资产）：`EXECUTION_FAILED`。

 traceback（逐字）：

```
src/agent_box/server/execution/sidecar.py:1270 open_execution
src/agent_box/server/execution/sidecar.py:452  launch -> materialize_subscription(...)
src/agent_box/server/execution/sidecar.py:593  client.request("home.put", {...})
plugins/agent-box-runtime-wsl/.../client.py:448 raise WorkerError(...)
agent_box_runtime_wsl.client.WorkerError: operation is unsupported
```

同一次运行里 `home.prepare` 成功、`home.put` 被拒 —— 所以不是通道没建立，是**这一个 op 没接线**。

## 2 定位（引用，两处行号一手核对）

| 位置 | 内容 |
| --- | --- |
| `workers/agent-box-worker/src/main.rs:2153` | `handle_home` 里 `"home.put" => {…}`：解码 base64、空/超限 ⇒ `HOME_IO`、非普通文件拒绝、写完 fsync。**实现是完整的** |
| `workers/agent-box-worker/src/main.rs:355` | 唯一分发点：`"home.prepare" \| "home.list" \| "home.get" \| "home.delete" => match handle_home(...)`。**少了 `home.put`** |
| `workers/agent-box-worker/src/main.rs:491` | 兜底臂：`OP_UNSUPPORTED / "operation is unsupported"` |

`main.rs` 里 `handle_home` 只在 355/356 被分发线调用一次；Server 侧 `home.put` 只有一个调用点
（`sidecar.py:593`）。所以缺口是单点、确定性的，不是竞态。

## 3 为什么它活到今天

Worker 自己的 home 测试**直调 `handle_home`**（`main.rs:3055` 起的
`handle_home(&root, "home.put", &json!({...}))`），绕开了分发 `match`。实现级与线级各自绿，
合起来 100% 红 —— 缺的那一层覆盖恰好是"穿过真实进程的那条线"。

对照 58 的账行（`status.md:661`）：它是 `ASSET_HUBS_PARTIAL`，登记的"物化进执行"没有声称真
Worker 二进制上跑通过 ⇒ 本发现与账本不冲突，是它 PARTIAL 剩余里的一块真肉。

**未验证**（不外推）：58 的资产面是否还在别处（本地通道/Windows）被真实跑通过——本轮只在 WSL
stdio 通道上实测。

## 4 影响面

- **实测**：65 的委派桥在真实通道上写不进 guest home ⇒ 真 harness 父侧自发起 `tools/call` 这一圈跑不起来（086 阶段 2）。
- **引用**（同一调用点、同一 `asset_files` 分支，`sidecar.py:450-456`）：用户 MCP 文件与 skill 资产走的是**同一个** `materialize_subscription` ⇒ 同一条线。技能是否真受影响本轮未单独跑。
- **引用**：56 的订阅登录文件走 `sidecar.py:441-449` 的另一个分支，同样落到 `home.put`。

## 5 修法与不变量

一行接线：把 `home.put` 加进 `main.rs:355` 的臂（或与 `handle_home` 的支持集派生一致）。
**不动** `handle_home` 的边界（大小上限、转义拒绝、非普通文件拒绝、错误码逐字保持）。
新二进制投递到**新** bundle 目录（`.acceptance-bundle-c12`），旧 bundle 保留 —— 它同时是门 G1 的反例样本。

## 6 门设计（含反例）

| 门 | 正例 | 反例（必须能咬） |
| --- | --- | --- |
| G1 | 真 Worker 进程上 prepare→put→get/list 读回同一份字节 | 同一条用例跑**旧 c11**：必须 `OP_UNSUPPORTED` |
| G2 | 空/超限/目录目标/转义名 ⇒ 各自类型化错误 | 被放宽成 200 即门红 |
| G3 | `handle_home` 支持集 == 分发臂集合（读两处源码比对） | 人为从臂里删一个 op ⇒ 门红 |
| G4 | `cargo test` + 根套件计数不降 | 既有用例变红即门红 |
| G5 | 086 阶段 2 父轮不再死于 `OP_UNSUPPORTED` | 仍报该码即门红 |

## 7 顺手登记的连带发现（不属本单范围，只记录）

- **`timeoutMs` 上界**：Server 校验 `1 <= timeoutMs <= 120_000`（`src/agent_box/server/bootstrap/runtime.py:530`），
  超了整份 deployment 直接 `SIDECAR_DEPLOYMENT_INVALID`（**实测**：本单第一次跑就是它打回来的）。
  而委派子轮可等待 `subagents.DEFAULT_TIMEOUT_SECONDS = 600`（`src/agent_box/server/profiles/subagents.py:32`）。
  ⇒ 嵌套父轮的宿主进程上限 120 s，子等待上限 600 s，**两者没有派生关系**。本轮按 120 s 跑，若真咬到再单开一单。
- **桥的 fetch 无客户端超时**（`plugins/agent-box-harnesses/runtime/subagent-bridge.mjs:17`，引用）：
  它只等服务端答复，服务端自己有 600 s 界限。
- **`session/request_permission` 无人应答**（086 §8 已登记）：本轮靠 `permissions.allow` 预批准绕过，
  真机产品路径上任何需要弹提示的工具都会卡在一条没人能答的请求上。
