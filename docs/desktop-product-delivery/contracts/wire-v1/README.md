# wire-v1 候选（WIRE_REVISION_PENDING_BACKEND）— Desktop↔Server 核心合同单一编码

状态：**WIRE_REVISION_PENDING_BACKEND**（2026-09-14，已消费后端
ACCEPTED_WITH_MECHANICAL_CORRECTIONS；新摘要待后端登记）。
语义权威：[../core-semantics-v1.md](../core-semantics-v1.md)（APPROVED_SEMANTICS）——
本候选只做已批准语义的机械编码，并把编码本身作为提案交后端核对；两者都不是生产端点授权。

## 单一权威与投影

| 投影 | 位置 | 说明 |
| --- | --- | --- |
| **可执行权威** | `apps/desktop/src/types/wire/wire-v1.ts` | zod schema：静态类型（`z.infer`）、运行时校验、JSON Schema 导出三者同源，无手写副本 |
| 服务端评审面 | `generated/wire-v1.schema.json` | 由 `wireJsonSchemas()` 生成，禁止手改；重生成命令见下 |
| 语义对照 | [semantics-map.md](semantics-map.md) | core v1 §8 每项能力 → 方法/事件/错误；幂等作用域逐方法登记；§9 场景 → fixture 计划 |

摘要（SHA-256，前 16 位）：权威 `2874fae7c763a6e7`；生成工件 `c9be8a63097aa6b1`。
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
