# wire-v1 合同（WIRE_LOCKED_FOR_IMPLEMENTATION）— Desktop↔Server 核心合同单一编码

状态：**WIRE_LOCKED_FOR_IMPLEMENTATION**（2026-09-14，已消费后端唯一队列终态机械更正；
后端已用同一摘要登记确认）。当前 **59 方法**（28 方法锁定核心 + 31 个纯增量面：usage/probe/
artifacts、56/58/59/60/62/63/64 的新面；增量不动核心语义）。
语义权威：[../core-semantics-v1.md](../core-semantics-v1.md)（APPROVED_SEMANTICS）——
本候选只做已批准语义的机械编码，并把编码本身作为提案交后端核对；两者都不是生产端点授权。

## 单一权威与投影

| 投影 | 位置 | 说明 |
| --- | --- | --- |
| **可执行权威** | `apps/desktop/src/types/wire/wire-v1.ts` | zod schema：静态类型（`z.infer`）、运行时校验、JSON Schema 导出三者同源，无手写副本 |
| 服务端评审面 | `generated/wire-v1.schema.json` | 由 `wireJsonSchemas()` 生成，禁止手改；重生成命令见下 |
| 语义对照 | [semantics-map.md](semantics-map.md) | core v1 §8 每项能力 → 方法/事件/错误；幂等作用域逐方法登记；§9 场景 → fixture 计划 |

### 摘要登记（P21，2026-09-18）

**后端已登记的最后一条**——`agent-box-env-provider/docs/server-round1/wire-review.md`
第 434–437 行（Order 55 G2，前端提交 `b284f70c`），逐字：

| 工件 | 后端登记值 |
| --- | --- |
| TS 权威 `apps/desktop/src/types/wire/wire-v1.ts` | `64dc99610b15360d4d114cb377b9034efeab127d5d15a34da5b7db8f42d8e08f` |
| 生成工件 `generated/wire-v1.schema.json` | `42a164a47697f7481f4e5a224e7e2f5241719c1fa3fa476fa54f824c2096433d` |

本树随后重生成的两对，都只在同一工具链（Node v22.23.2 / zod 4.4.3 /
`--experimental-strip-types`）内可比：

| 时点 | TS 权威 | 生成工件 | 方法数 |
| --- | --- | --- | --- |
| 阶段 1（读后端登记值后重生成，未扩合同） | `a0693877c8d2c28909024b556fd9105363e1a5f2770c9b50a50ad06fe4491635` | `d34b7aa9d42666ff143fef5dbfee7def8fcebc4da3f9bad40e80fb47d95d04b8` | 33 |
| **阶段 2（本单交付：编入 56/58/59/60/62/63/64 的新面）** | `6e8ae84a1abeb32c89b6761068ec3f380991bbf8497645626b700ed70cd5dedb` | `f5d27269184aa387ce1227dbf8497e25b51e0d7ba5d3360f412e9b8cda33a583` | **59** |

**⇒ 交后端的提案对就是阶段 2 这一行**（工件本体见 `generated/wire-v1.schema.json`）。
两端**未锁定**，三条都是实测（不是推断）：

1. **本树权威在后端登记之后动过两次**：`2e9d37c2`（Order 57 C，`providerArtifacts.*`）与
   本单的阶段 2。前者在后端 `wire-review.md` **零登记**；后端只持有与之对应的工件副本
   `fullstack/generated/wire-v1.schema.json`
   （sha256 `a1bd52a4fb68436079ae2d2e439953e8ac7f345ab5934a936a9434952bee0729`，方法集含
   `providerArtifacts.*`）。
2. **文件式摘要不可跨工具链复现**：用本目录命令重生成 `b284f70c` 的权威得
   `d465e526…`（≠ 后端登记的 `42a164a4…`）。差异是等价的两种联合编码——
   zod 4 输出 `{"anyOf":[…]}`，后端登记值里是 `{"type":["string","number"]}`（zod 3 形）——
   **语义相同、字节不同**。反向对照：同一条命令重生成 `d7464166` 的权威**逐字节**等于当时提交的
   `14f7f736…` ⇒ 命令确定，不可复现来自工具链。**重锁必须交工件本体，只报摘要不足以对齐。**
3. 本目录里的工件副本自 `d7464166` 起**曾落后**（停在 `14f7f736…`，不含
   `providerArtifacts.*`）；阶段 1 已按命令重生成，阶段 2 再随合同扩展重生成。

重生成：`cd apps/desktop && node --experimental-strip-types -e "import('./src/types/wire/wire-v1.ts').then(async m => { const fs = await import('node:fs'); fs.writeFileSync('../../docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json', JSON.stringify(m.wireJsonSchemas(), null, 2) + '\\n') })"`

**放置说明（机械选择）**：权威放 `src/types/wire/` 而非本目录，是为了让客户端直接
import 同一模块（类型/校验/导出同源，且不破坏 renderer 层序守卫）；本目录以其生成工件
与摘要为核对面。两端接受相同摘要即锁定（contracts/index.md 反馈通道）。

## P21 阶段 2 编入的面（按后端小节逐条核对，来源=后端实现而非转述）

| 来源 | 编入的方法/字段 |
| --- | --- |
| 58 | `assets.list / publishSkill / publishMcp / bind / unbind / bindings` |
| 58 G6+G7 | `assets.syncCatalog / catalog / installFromCatalog / probe` |
| 59 | `hooks.list / create / update / setEnabled / delete / triggers`；`assets.publishPlugin` |
| 60 | `profiles.clone`、`profiles.setPermissions`；profile 投影 + `permissionPreset` / `permissionRules` / `originProfileId` |
| 62 | `workspaces.gitStatus`（六字段各自可 null + `reason`） |
| 63 | `profiles.memory`（`available/reason/files/note?`，拒绝项无内容） |
| 64 | `executions.list`（行含 `pid`/`pidReason`，上限 200 类型化拒绝） |
| 56 | `accounts.list / create / bind / importAsset`；profile 投影 + `accountId`（**见下**） |

**核对时的两条后端事实（本树只登记，不改后端）**：

1. `providerArtifacts.install` 的 `_PARAM_SHAPES` 与自己的 handler 不一致：
   handler 读 `params["digest"]`（`handlers.py:1236`），而参数表只列
   `{requestId, harness, version, sourceToken}`（`handlers.py:128-130`），`dispatch()`
   会把 `digest` 当 unexpected 拒掉（`handlers.py:388-393`）⇒ **该方法当前不可能调用成功**。
   本树合同要求 `digest`（与 handler 一致），等后端改参数表。
2. `assets.installFromCatalog` 的 `installed.asset_id` 是全 wire **唯一** snake_case 字段
   （`assets/catalog.py:198-200`）。本树如实编码为 `asset_id`（合同描述现实，不美化），
   登记待后端统一。

**刻意不编入**（不是遗漏）：`profiles.subagentGrants/grantSubagent/revokeSubagent`（Order 65
仍在飞）与 `usage.aggregate/export`（Order 53 未收口）——后端已实现但属未收口的单，
纳入会把移动目标冻进合同。等对应单收口后单独重锁。

## P21 阶段 3 的四个只读面（渲染层如何用这些方法）

- **Git 卡**：`workspaces.gitStatus` 的六字段，任一为 `null` 就显示其 `reason`（`GIT_*`），
  **不显示 0**；`0` 只在服务端真的答 0 时出现。
- **记忆分区**：`profiles.memory`；`available:false` ⇒ 整个分区不渲染（不画空分区、不画灰开关）；
  拒绝项按 `reason` 呈现且不渲染内容。
- **执行清单卡**：`executions.list`；`pid` 为 `null` 时显示 `pidReason`；超上限是类型化错误，
  不静默截断。
- **角色页增量**：profile 投影的 `permissionPreset` / `permissionRules` / `originProfileId`
  与 `assets.bindings` 的**只读**呈现（写方法 `profiles.clone` / `assets.bind` / `unbind` /
  `profiles.setPermissions` 已进合同但本单不调用——只读面闸门 G3）。

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
