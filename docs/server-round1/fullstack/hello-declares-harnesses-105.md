# 105 — `server.hello` 声明已注册的 harness 家族（证据）

工单基线 `198490d`；本单在 `2c39f8c`（104 收口后）上执行，是 R-0022 拆分后 **A 线队列第 2 张**。
§1–§4 属**阶段 1（观测）**。凡标 **实测** 为本单一手；**引用** 给出处。

## 1 实测：今天的 `hello` 确实没有这张面（真监听）

形态同 097：`build_runtime()` → `create_app` → `uvicorn.Server` 真 bind `127.0.0.1` 随机端口
→ `urllib` 真发 `POST /wire/v1/server.hello`。这一次注册表里**放了三个家族**（故意打乱顺序注册：
`zeta`、`alpha`、`mido`，其中只给 `alpha` 声明 `credentialKind`/`modelControlId`）：

| 项 | 实测 |
| --- | --- |
| `result` 顶层键 | `['auth', 'capabilities', 'protocolVersion', 'serverId']` ⇒ **没有 `harnesses`** |
| `capabilities` 条数 | **64**（097 的派生完好） |
| `HarnessRegistry.registered()` | `('alpha', 'mido', 'zeta')`——注册顺序是 zeta→alpha→mido ⇒ **顺序被丢弃、按 id 排序** |

⇒ 工单 §Objective 的"wire 上没有任何'这台服务支持哪些 harness'的面"成立；
且 §Scope 要的"稳定排序（按 id）"**注册表本来就给**（`registered()` 的实现是
`tuple(sorted(self._descriptors))`，实测见上），不需要在 handler 里再排一次。

## 2 实测：描述符上**可得**的字段（决定本单最多能声明什么）

`HarnessDescriptor` 是 dataclass，字段与默认值一手读（`dataclasses.fields`）：

| 字段 | 默认 | 本单是否暴露 |
| --- | --- | --- |
| `harness_type` | **必填** | 是 ⇒ 出成 `id` |
| `credential_kind` | `None` | 是（`credentialKind`），**`None` 就不给键** |
| `model_control_id` | `None` | 是（`modelControlId`），同上 |
| `credential_environment` | `None` | **否**（凭据环境是宿主细节，不是目录需要的东西） |
| `capability_claims` / `control_options` | 必填 | **否**（那是能力/控件表，不是家族目录；且 `capabilities` 是方法表，§明确不做 已点名别混） |
| `security_locked_controls` | `()` | **否** |
| **`wire_protocols`** | — | **不存在这个字段** |

⇒ **工单 §Current state 那一行是错的**：它写"描述符已带 `credential_kind`/`model_control_id`/
`wire_protocols`（后者来自 092 修订）"，而 `hasattr(descriptor, "wire_protocols") == False`（实测）。
092 还没落地（R-0022 之后它在 **runtime 线** 的 `c2`），所以 `wireProtocols` 这个键
**今天给不出来**。按工单自己的规则"未知/未声明就不给该键"，本单只暴露
`{id, credentialKind?, modelControlId?}`，**不发明** `wireProtocols`；
092 落地后由那张单在同样的位置补键（登记为交回，见 §5）。

## 3 实测：默认组合注册**零**个家族（G3 的空态就是今天每一次进程内组合的形状）

```
build_runtime(临时根).harnesses.registered() -> ()
```

而真机上的家族来自**部署文档**：`bootstrap/runtime.py:491` 起
`registry = HarnessRegistry()` 后遍历 `value["harnesses"]`，逐条读
`id` / `adapter` / `modelControlId` / `credentialKind`（`runtime.py:492-499`）——
**恰好就是本单要暴露的那两个可选键**（引用，出处给出）。

两条后果：

1. G3 的"`harnesses: []`"不是一条人造用例：本树每一次 `build_runtime()` 都是这个形状；
2. `bootstrap/**` 按 R-0023 属 **runtime 线**，本树**不写** ⇒ 本单只读它来核对键名拼写一致。

## 4 实测：重锁这一步**不在本树能做的范围里**（这是本单的硬约束）

| 事实 | 一手 |
| --- | --- |
| `server.hello#result` 根对象 `additionalProperties: false`，properties 只有那四个键 | 前端**权威工件** `contracts/wire-v1/generated/wire-v1.schema.json`（321,485 B，`sha256:1a3604ee9dd543ee…`，`$protocolVersion="wire/1"`，覆盖 **64** 个方法 / 134 条目） |
| 本树那份是**证据副本**：`docs/server-round1/fullstack/generated/wire-v1.schema.json`（212,653 B，`sha256:a1bd52a4fb684360…`，只覆盖 **33** 方法） | `sha256sum` ＋ `git ls-files` 命中；与工单 102 §Current state 记的两个摘要**逐字相同** |
| 全树（`src/agent_box/**`、`scripts/**`）**没有任何生成 wire 工件的代码** | `grep -rln "json-schema.org/draft-07\|\"\\$schema\""` 只命中 `scripts/server-round1/shared-store-concurrency-gate.py`（无关）；`src/agent_box/server/wire/*.py` 里没有 schema 发射器 |
| 权威是**前端 TS** `apps/desktop/src/types/wire/wire-v1.ts`，工件由它生成 | `docs/server-round1/wire-review.md` 的历次登记（同一对摘要成对出现）；工单 081/P21 的重锁流程 |

⇒ **"重生成工件"这一步在本树没有工具也没有写权**：TS 权威在前端树（本树 `forbidden`）。
历史上（`wire-review.md` 四段登记）流程是**前端提交新权威 → 后端按新工件跑 `AGENT_BOX_WIRE_SCHEMA` 校验 → 两树登记同一对摘要**。
⇒ 本单能做的是：把字段实现好、把门做硬、把"新形状"以**可校验的证据**交出去（含我建议的 `harnesses` 条目 schema 片段），
并如实把 G4 标成**未绿**——不拿"本树改了证据副本"冒充重锁（那份副本本身是 102 的射程）。

## 5 阶段 1 的落点（供阶段 2 起跳）

1. 形状：`harnesses: [{id, credentialKind?, modelControlId?}]`，来源 `self.harnesses.registered()`
   ＋ `self.harnesses.get(id)`（`WireService` 已持有注册表：`handlers.py:282`）。
2. 排序：**沿用注册表的 `sorted()`**，不在 handler 里另立一套顺序（两处排序迟早分叉）。
3. 空态：`[]`，不是省略、不是 500。
4. `wireProtocols` 键**不给**（§2：字段不存在）；092 落地后补，登记成交回而不是现在发明。
5. 不泄漏：只出这三个键 ⇒ 无凭据内容、无路径、无 digest；但**要有一条真断言**（G2），
   因为"只出声明"最容易在下一次加字段时被顺手破掉。
