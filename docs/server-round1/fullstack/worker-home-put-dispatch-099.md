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

## 8 阶段 3 的门（真实进程 wire）

实测：`tests/server/test_worker_home_put_wire_099.py` 4 passed（`python3 -m pytest tests/server/test_worker_home_put_wire_099.py -q`）。
一条用例按 bundle 参数化成两份（`c11-pre-fix` / `c12-wired`），**同一份请求序列**跑在两个二进制上：

| 门 | 正例（c12） | 反例（c11） |
| --- | --- | --- |
| G1 | `home.prepare` → `home.put` → `home.get` 读回同一份字节，`home.list` 里出现 `state/auth.json` | `home.put` ⇒ `OP_UNSUPPORTED` 且消息逐字 `"operation is unsupported"`；**同一条线上 `home.list` 仍正常**（证明反例只咬一个 op，不是一条死通道） |
| G2 | 空/超限/转义/目录目标 ⇒ 各自类型化错误，越界符号链接之外那个 `outside` 哨兵文件字节仍是 `untouched` | 任一被放宽成 200 即门红；用例尾再发一发 `home.get` 证明流还活着（对照 `unreachable!()` 的崩流） |
| G3 | `the_dispatch_arm_and_handle_home_cover_one_home_operation_set`（`cargo test`，43 passed） | 见 §9 |
| G4 | 见 §10 | 见 §10 |
| G5 | 见 §10 | 见 §10 |

`G2` 的**实测与工单文本不一致，登记不改**：空 payload 回的是 `REQUEST_INVALID`（`"required string is missing"`），
不是 §5 预期的 `HOME_IO`。原因是 `value_string`（`main.rs:739`）先把空串筛掉，所以 `handle_home` 里
`payload.is_empty()` 那一支在真实客户端上**不可达**（超限 256 KiB+1 仍走 `HOME_IO`，实测一致）。
⇒ 连带一项 交回：`home.put` 的空载荷分支是死代码，要么在 `handle_home` 侧接受"到不了"，要么把空载荷改成
经 `bytes` 传（本单不动边界，按工单 §5 的"错误码逐字保持"）。

## 9 发散门真能咬（一手演示）

把 `main.rs` 分发臂里的 `"home.put" | ` 手工删掉（改前先 `cp` 备份，改后按 sha256 还原），跑单个门：

```
test home_tests::the_dispatch_arm_and_handle_home_cover_one_home_operation_set ... FAILED
assertion `left == right` failed: the request loop routes ["home.delete", "home.get", "home.list", "home.prepare"]
while handle_home implements ["home.delete", "home.get", "home.list", "home.prepare", "home.put"]
  left: ["home.delete", "home.get", "home.list", "home.prepare"]
 right: [..., "home.put"]
```

⇒ 门读的是两处**真源码**，不是复制一份名单；删一个 op 立刻红，并把两侧集合打出来。
还原后 `sha256` 与备份一致：`1ee8a9ac42b73bad00364c9f14251de4507629f33457badd6451b98a9038545b`，`cargo test` 43 passed。

## 10 阶段 4 收口（消费者 = 086 真轮）

- **G5 实测**：`tests/server/test_subagent_harness_real_round_086.py` 由红转绿（1 passed，14.25 s）。
  父轮完整跑通一条真链：真 CLI 读 `.claude.json` → MCP `tools/list` 带上两个桥工具 → 父自己调
  `list_subagents`（拿回 `[{"name":"086 beta",...}]`）→ 父自己调 `run_subagent` → Server 派到 beta 的
  Profile 跑出**一个真子轮**（`usage_source: "claude-projects-line"`，`parent_turn_id` 归属唯一）→
  摘要 `{"subagent":"086 beta","state":"completed","summary":"086-REAL-ROUND-CHILD-DONE..."}` 回到父历史 →
  父最终文本带上它。`unauthorizedProviderRequests = 0`，出口审计与清理四项全干净。
  全程 0 次真实模型调用（端点是 fixture 的 loopback，注入的 key 与端点校验的是同一常量）。
- **c12 的默认化**：086 用例的默认 Worker 由 `.acceptance-bundle-c11` 改指 `.acceptance-bundle-c12`。
  c11 仍作反例，但**只由 099 的 wire 用例按名钉住**；留在 086 的默认位上就是"根套件故意红"。
- **fixture 的一处自身缺陷（实测，与产品无关）**：脚本读 `tool_result` 时取的是"最新一条消息里的**第一个**块"。
  一轮里连发两个工具时，两个结果并排落在同一条 user 消息里，于是永远先读到 roster，父轮明明已经拿到子摘要却
  被判定"没拿到"，脚本又委派了第二次（`DELEGATION LOOP`）。改成取**最新**一个结果并额外记录整条
  `toolResults`/`historyToolCalls` 链后一次通过。⇒ 登记一条通用教训：多工具轮的观测要按"消息内多块"算。
- bundle：c11 `sha256 c1e353c89609ab2feed0765205feeb3eb4c8db9679f353ba4065302df35a2457`（冻结反例，`workerVersion 0.1.0 / wireVersion 1`），
  c12 `sha256 9d8df86d214bf2b3e99afa461bd5ca83c62caae847cec507ea20e2518ce97088`（修好后重建到新目录，同一版本对）。
- **G4 实测**：根套件 **946 passed / 0 failed / 0 error**（284.51 s）＝ 941 ＋ 086 真实轮 1 ＋ 本单 wire 4，**零退化**。
  第一次全量跑报的 4 个 `ERROR` **不是产品回归**：`test_state_capture_error_boundary` 按 mtime 判定
  `target/debug/agent-box-worker` 落后于 `main.rs`（阶段 3 向 `main.rs` 加了 90 行门，字节未变但更新时间变了），
  `cargo build` 后复跑即全绿。
- **费用与清理**：真实模型调用 **0 次 / ¥0**（wire 用例只起进程与真 socket，086 的端点是 loopback 脚本假端点）；
  凭据 locator 全程未访问；c11 冻结件一字未动（只在按名钉住的反例用例里被读），无 `/tmp` 残留。
- **未做（本单不做）**：`home.put` 空载荷死支的清理（见 §8 末：真实客户端上它是 `REQUEST_INVALID` 到不了
  `HOME_IO`）；`home.*` 之外的其它未接分发臂 op 的全量普查。**同一条线只钉了 `home.`**（本单的 G3 门读的
  就是这两处 `home` 集合）；Server 侧 64 个 HTTP 方法的"从未被真线驱动"是**同一形状**，由 **103** 在方法面上通用化，
  而 `main.rs` 分发臂里 `home.` 之外的 op 普查仍**无主**（记为交回，不在本单偷扩范围）；
  bundle 的签名/发布链路。
