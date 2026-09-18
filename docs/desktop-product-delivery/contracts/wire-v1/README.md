# wire-v1 合同（WIRE_LOCKED_FOR_IMPLEMENTATION）— Desktop↔Server 核心合同单一编码

状态：**WIRE_LOCKED_FOR_IMPLEMENTATION**（2026-09-14，已消费后端唯一队列终态机械更正；
后端已用同一摘要登记确认）。当前仍为 28 方法。
语义权威：[../core-semantics-v1.md](../core-semantics-v1.md)（APPROVED_SEMANTICS）——
本候选只做已批准语义的机械编码，并把编码本身作为提案交后端核对；两者都不是生产端点授权。

## 单一权威与投影

| 投影 | 位置 | 说明 |
| --- | --- | --- |
| **可执行权威** | `apps/desktop/src/types/wire/wire-v1.ts` | zod schema：静态类型（`z.infer`）、运行时校验、JSON Schema 导出三者同源，无手写副本 |
| 服务端评审面 | `generated/wire-v1.schema.json` | 由 `wireJsonSchemas()` 生成，禁止手改；重生成命令见下 |
| 语义对照 | [semantics-map.md](semantics-map.md) | core v1 §8 每项能力 → 方法/事件/错误；幂等作用域逐方法登记；§9 场景 → fixture 计划 |

### 摘要登记（P21 阶段 1 第一手核对，2026-09-18）

**后端已登记的最后一条**——`agent-box-env-provider/docs/server-round1/wire-review.md`
第 434–437 行（Order 55 G2，前端提交 `b284f70c`），逐字：

| 工件 | 后端登记值 |
| --- | --- |
| TS 权威 `apps/desktop/src/types/wire/wire-v1.ts` | `64dc99610b15360d4d114cb377b9034efeab127d5d15a34da5b7db8f42d8e08f` |
| 生成工件 `generated/wire-v1.schema.json` | `42a164a47697f7481f4e5a224e7e2f5241719c1fa3fa476fa54f824c2096433d` |

**本树当前重生成的一对**——用下条命令在 `dcfaf4d8` 的工作树上实测
（Node v22.23.2 / zod 4.4.3 / `--experimental-strip-types`）：

| 工件 | 本树当前值 |
| --- | --- |
| TS 权威 `apps/desktop/src/types/wire/wire-v1.ts` | `a0693877c8d2c28909024b556fd9105363e1a5f2770c9b50a50ad06fe4491635` |
| 生成工件 `generated/wire-v1.schema.json` | `d34b7aa9d42666ff143fef5dbfee7def8fcebc4da3f9bad40e80fb47d95d04b8` |

**⇒ 两端未锁定**（两条都是实测，不是推断）：

1. **本树 TS 在后端登记之后又动过**：`2e9d37c2`（Order 57 C，`providerArtifacts.*`）改了权威，
   而这条重锁没在后端 `wire-review.md` 留登记行——后端只持有与之对应的工件副本
   `docs/server-round1/fullstack/generated/wire-v1.schema.json`
   （sha256 `a1bd52a4fb68436079ae2d2e439953e8ac7f345ab5934a936a9434952bee0729`，方法集含
   `providerArtifacts.*`）。故"后端最后登记值"停在 `b284f70c`，本树权威已在前。
2. **文件式摘要不可跨工具链复现**：用本目录命令重生成 `b284f70c` 的权威得
   `d465e526…`（≠ 后端登记的 `42a164a4…`）。差异是等价的两种联合编码——
   zod 4 输出 `{"anyOf":[…]}`，后端登记值里是 `{"type":["string","number"]}`（zod 3 形）——
   **语义相同、字节不同**。所以重锁必须把**工件本体**交给后端重新登记，
   只报摘要不足以让两端对齐；摘要只在同一工具链下可比。
3. 本目录里的工件副本自 `d7464166` 起**已落后**（停在 `14f7f736…`，不含
   `providerArtifacts.*`），本次已按命令重生成补齐。

重生成：`cd apps/desktop && node --experimental-strip-types -e "import('./src/types/wire/wire-v1.ts').then(async m => { const fs = await import('node:fs'); fs.writeFileSync('../../docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json', JSON.stringify(m.wireJsonSchemas(), null, 2) + '\\n') })"`

**放置说明（机械选择）**：权威放 `src/types/wire/` 而非本目录，是为了让客户端直接
import 同一模块（类型/校验/导出同源，且不破坏 renderer 层序守卫）；本目录以其生成工件
与摘要为核对面。两端接受相同摘要即锁定（contracts/index.md 反馈通道）。

## 编码提案摘要（PROPOSED，机械层）

- **信封**：JSON-RPC 2.0 形（`{jsonrpc:'2.0', id, method, params}` / `{id, result?, error?}`）——
  本仓已验证的协议形（@hermes/shared json-rpc-gateway），可同时落在 HTTP POST 与 WS 事件流。
- **HTTP 绑定提案**：`POST /wire/v1/{method}`（body=params，响应=信封）；事件流走
  长连通道（`wire.eventStream/1`），订阅恢复由 `history.snapshot` 的游标承担，
  不另设订阅 RPC。路径/头名是提案，未经核对不接生产。
- **身份**：对象 id 服务端分配、不透明、跨改名/重连/归档恢复稳定；展示名/路径/原生
  Harness 会话 id 永不作业务身份（core v1 §3）。
- **幂等**：所有变更调用带客户端 `requestId`；作用域逐方法登记在 semantics-map；
  同 id 不同 payload → `CONFLICT_REQUEST`（§3）。
- **并发**：可变业务记录带服务端 `version`；写携带 `expectedVersion`，冲突回
  `CONFLICT_VERSION` + current（§3）。
- **错误族**：UNAVAILABLE / UNAUTHENTICATED / FORBIDDEN / NOT_FOUND / CONFLICT_VERSION /
  CONFLICT_REQUEST / INVALID_REQUEST / CAPABILITY_UNSUPPORTED / OUTCOME_UNKNOWN /
  WORKER_UNREACHABLE / APPROVAL_INVALID——超时未知可查询、能力缺失可呈现、审批失效可判别。
- **事件**：稳定 `eventId` + 会话内 `seq` + 不透明 `cursor`；重放只恢复呈现；
  过旧游标 → `history.snapshot` 答 `resync_required`（§7）。
- **降级**：`server.hello` 报能力表（supported=false 必带 reason）与认证要求；
  客户端按声明呈现，不猜测（§8 row 1）。

## 已纳入的核心维护增量

后端 11:05 的 `CHANGES_REQUESTED_CORE_COVERAGE` 已机械落实为同一 wire-v1 的
`profiles.create/update/archive/updateConfig` 与 `providerModels.list/create/update/archive`；
Provider/Model 凭据只传不透明 `credentialId`，引用保护使用 `CONFLICT_REFERENCE`。

P03 生产接线补差同时纳入 `sessions.list/update/archive`、可恢复 message role/display/order、
独立 `olderCursor`、`queue.updated`，以及模糊发送确认所需的 queue/config 回执。否则 Desktop
重启只能依赖 renderer 旧缓存，无法兑现 core §3/§7。

## 尚未进入本核心 wire 的增量范围

1. `sessions.send` 的 steer 能力：队列默认 follow-up 已编码；steering 的并发语义
   （同一执行内的插队帧）无已批准细则，未设方法。
2. Worker 通道建连方向与传输（§1 允许非 TCP/复用 WSL/SSH）不在本 wire 范围——
   属执行端通道合同，客户端只消费"已连接"事实。
3. `history.snapshot` 快照分页粒度与事件批量上限（机械参数，倾向由服务端定）。

认证引导已按后端反馈收口：所有 wire 方法（含 hello）要求 Bearer session token；Electron
宿主从 Server data root 的受保护 token 文件读取，renderer 不得持有或传递该秘密。

## 评审与反馈

后端答复：`/home/maoqh/projects/agent-box-server-round1/docs/server-round1/wire-review.md`
（候选 HEAD、schema 摘要、ACCEPTED/CHANGES_REQUESTED、精确更正）。
前端每阶段检查答复，机械更正直接落实并记录接受摘要；无答复文件≠拒绝。
锁定 = 双方登记同一权威+工件摘要（WIRE_LOCKED_FOR_IMPLEMENTATION）。

本端回应：[backend-response.md](backend-response.md)。已接受 hello 认证、宿主读取受保护 token
文件、Harness 仅作数据三项；新工件修复信封/能力约束并编码 Server 权威队列身份。后端仍需
登记新摘要并补齐回应文件列出的事件投影与 wire event stream 差异。

P07 检查点 3 已提供九组 §9 可执行 fixture、中立注入式客户端和纯事件重放投影。生产客户端没有
默认 fetch/mock transport；Bearer token 仍只属于后续 P04 Electron transport。
