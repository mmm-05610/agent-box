# 跨仓库合同面（wire face）实测 — LNX-001 自有证据

调查者：Qoder 主调查会话（非子 agent）。采样时间 2026-09-21 15:2x +08:00。
全部结论来自只读 `git show` + JSON 结构比较；未执行任何构建、测试或服务连接。

## 1. 三方合同工件的位置

| 角色 | repo | 分支 | 路径 | 内容身份（sha256 前 12） |
| --- | --- | --- | --- | --- |
| 后端登记面 | backend `repos/backend` | `feature/env-provider-v1` @ `003b52b2b18a` | `docs/server-round1/fullstack/contract/wire-v1.schema.registered-c4255b31.json` | `c4255b31dba1` |
| 后端 runtime 侧快照 | backend | `feature/env-provider-runtime` @ `a7b7b6ff15ab` | `docs/server-round1/fullstack/generated/wire-v1.schema.snapshot-33methods-stale.json` | `a1bd52a4fb68` — 名字自称 **stale、33 方法** |
| 桌面 chat 生成面 | desktop `repos/desktop` | `feature/agentbox-desktop-product` @ `08b4eac7fe10` | `docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json` | `1a3604ee9dd5` |
| 桌面 settings 生成面 | desktop | `feature/agentbox-desktop-settings` @ `01083212aaad` | 同上 | `2dd265615fcd` |

复现：`git -C repos/backend show feature/env-provider-v1:docs/server-round1/fullstack/contract/wire-v1.schema.registered-c4255b31.json | sha256sum`

- **方法词汇表在四条线之间完全一致**：后端两线的 `src/agent_box/server/wire/handlers.py` 各自提取出**同一组 64 个方法名**（差集双向为空）；两条桌面对这 64 个方法**全部有引用点**（未引用数 0）。
  复现：对每个分支 `git show <b>:src/agent_box/server/wire/handlers.py` 后按 `"a.b"` 字面量取集合再求差。
- **方法名一致 ≠ 语义一致**。三份合同文件**字节全部不同**（`c4255b31` / `1a3604ee` / `2dd26561`），键集合却都是 134 项 / 64 方法。

## 2. 差异只集中在两个功能面（叶子级实测）

| 方法 | 后端登记面 vs 桌面 chat | 后端登记面 vs 桌面 settings | 性质 |
| --- | --- | --- | --- |
| `server.hello#result` | **差 1 处** | 一致 | chat 面**缺** `harnesses` 数组（后端登记面有） |
| `providerModels.list#result` | 一致 | **差 9 处** | settings 面**多出** `compatibility`、`protocols`、`protocolsDeclared`、`endpoints`、`models[].capabilities`，且 `harness` 由 `string(minLength 1)` 变为 `string|null` |
| `providerModels.create#result` | 一致 | 多出同类字段 | 同上（`providerModel.*`） |
| `providerModels.{create,update,archive}#params` | 一致 | 条目级报差、**叶子级 0 差**（键序不同） | 非语义差异 |

**读法**：两条桌面线各在**不同的**合同面上领先对方，且各自与后端登记面**都不完全一致**——
chat 落后于 `hello.harnesses`（对应后端工单 105 的登记），settings 领先于 `providerModels.*`
的 092 上游投影（对应 P28 stage 1）。这不是"哪份是最新的"能一句话解决的。

## 3. 时间与自述证据（说明为何会漂）

- 后端登记面最后改动：`df115c7` **2026-09-19**，其提交信息自述：**"未做项：与桌面树现物字节对表
  （跨树读取被本环境拦下）"**，并点名两条漂移交回工单 102 重锁，本单不改对方合同。
  复现：`git -C repos/backend log -1 --format=%B df115c7`
- 桌面 chat 面：`12be72f9` **2026-09-18** "P26 stage 1: contract grows 59->64 …new digest pair 1019b38b/1a3604ee"。
- 桌面 settings 面：`7e314ab2` **2026-09-20** "P28 stage 1: bind the 092 upstream facts that the wire actually projects, and re-lock"。
- runtime 线仍带 33 方法的 stale 快照，而 `docs/implementation/work-orders/102-contract-drift-two-faces.md`
  只在 service 线与 runtime 线的共同改动文件清单里出现（见 `parts/backend-common-changed-files.txt`）。

## 4. 与未完成工单的关系（来自 control/backlog-full.tsv，未派工）

| 工单 | 树 | 记录状态 | 与合同面的关系 |
| --- | --- | --- | --- |
| `102` contract-drift-two-faces | 后端两线共同 | 已合流为共同改动文件 | 两面漂移的**账上归属**，其"交回重锁"未闭合 |
| `105` hello-declares-harnesses | service | — | 后端登记面已含 `harnesses`；chat 面未跟上 |
| `P28` provider page | settings | `PARTIAL` | settings 面的 `providerModels.*` 丰富化正来自它，但页面本身未完成 |
| `151` 受控凭据录入 | service | `DISPATCHED`（terminal 不是完成证据） | 其自述"64 个 wire 方法里**没有**凭据录入口"，与本节实测的 64 一致 |

## 5. 对整合顺序的含义（证据结论，不是决定）

1. 合同面是四条线的**第一个必须收敛的接缝**：任何一侧单独推进都会把另一侧的生成面变成 stale。
   已证实的是"三个字节身份互不相同、差集只在 `server.hello` 与 `providerModels.*`"。
2. `server.hello.harnesses` 与 `providerModels.*` 的 092 投影**都必须保留**——分别支撑
   "桌面从服务取 harness 目录"和"Provider 页显示上游能力"，删任一边即删掉一边的既有行为。
3. **无法仅从合同 JSON 确认的**：后端 handler 对 `harness: null` 的实际接受行为、
   `compatibility/protocols` 字段是否真被服务端产生、`122/134/156` 的截断/终态字段是否已进入
   `message.final`。这些需要运行期证据（见 `parts/linux-chain.md`）。

## 6. 摘要身份约定（实测闭合）

- runtime 线那份 33 方法快照的 sha256 前缀 = **`a1bd52a4fb68`**，与后端 `df115c7`
  提交信息里点名的"那 33 方法旧副本（`a1bd52a4…`）"**逐字吻合**。
  复现：`git -C repos/backend show feature/env-provider-runtime:docs/server-round1/fullstack/generated/wire-v1.schema.snapshot-33methods-stale.json | sha256sum`
- 由此确认本产品的"工件摘要"就是**合同 JSON 文件的 sha256**，跨树可比；
  service 线还把摘要写进文件名（`…registered-c4255b31.json`）自称"把身份写进文件名"。
- 桌面 chat 面 P26 提交记录的新摘要对 `1019b38b/1a3604ee` 中，`1a3604ee` 与该文件实测 sha256
  一致（`1a3604ee9dd5`）。
- `releases/candidate/manifest.md` 与 `control/current-state.md` §2 引用的 2026-09-15 锁定位
  （TS `11e3b3e7…`、生成工件 `5d4fa3bf…`）在当前四棵树里**未再出现**：在
  `apps/desktop/{src/api,electron/ipc,src/application/wire*}` 全量扫描中无任何文件命中这两个前缀。
  结论只到"锁定位已至少两度被后续重锁取代"，**不推断**当年那份对是否曾为真。

