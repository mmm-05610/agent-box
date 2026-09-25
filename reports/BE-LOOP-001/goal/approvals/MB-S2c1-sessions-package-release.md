# MB-S2c1 · sessions 物理包等价抽离批文

C · 2026-09-22 14:2xZ · 基线 backend integration
**`fe59016b91a09c7fbe561dcebe55665e06e320c4`**（＝S2a 后集成 HEAD，`CP-S-S2a.md`）。
S 为本批唯一产品码写者。请在 S 组 `work/` 下新建从本基线出发的隔离任务树（新分支），
先报树路径/HEAD/clean，ACK 后实施。`work/s2a`（已交付 `a581e30e`）与 `work/b2`、
`work/a3`、`work/sdm1` 均不续写。

依据：你方 `MB-2-S-exact-scope-proposal.md` S2-c1 节＋本批文。方案＝唯一实现逐字搬迁
＋旧入口同对象显式重导出，零行为变化、零 schema/数据权威变化、零公开语义变化。

## 允许的精确路径（11 条，其余须另报）

新增 5：
- `src/agent_box/service/sessions/__init__.py`
- `src/agent_box/service/sessions/service.py`
- `src/agent_box/service/sessions/repository.py`
- `src/agent_box/service/sessions/queue.py`
- `tests/server/test_s_mb_sessions_boundary.py`

修改 6（四搬三＋两改锚；改锚仅导入行）：
- `src/agent_box/server/sessions/__init__.py`（→同对象重导出载体）
- `src/agent_box/server/sessions/service.py`（→重导出）
- `src/agent_box/server/sessions/repository.py`（→重导出）
- `src/agent_box/server/sessions/queue.py`（→重导出）
- `src/agent_box/server/persistence.py`（仅 `:13` 导入行改锚新包）
- `src/agent_box/server/bootstrap/runtime.py`（仅 `:34-35` 导入行改锚新包）

明确不动：`server/execution/delegation.py`（经对象消费 Session 接口，零改动、旧导入
语义不变——E 物理域）；`storage/database.py` 及一切 `server_sessions` 表 SQL/DDL
（存储层事实）；schema/迁移/回填；wire/transport（S2-c2/c3 另批）；Profile（S2-b
另批）；E/H/P 任何文件；公开错误码/路由/wire 面。

## 等价与边界要求

- `SessionService`/`SessionRecords`/`QueueRecords` 旧/新 `is` 同一对象；旧四文件零
  `def`/`class` 第二实现；受理→冻结→建档→dispatch 次序、幂等回放、独立队列事件行为
  逐字节等价（实现逐字搬）。
- **过渡边如实声明**：新实现保留对 `agent_box.server.{errors,idempotency,ids}` 等共享
  设施的现行 import（以实搬后 `diff` 为准逐项列入钉中）——本批不提取共享设施、不假称
  import 图已净；`agent_box.service.sessions` 禁止 import `server.sessions`。
- 禁新增装配、注册、状态；禁新建空壳目录。

## 验收

S 定向（同环境、报基线与本批 FAILED/ERROR/skip/xfail ID 对照）：你组既有 sessions
相关定向集（含 block1/形状夹具）＋新钉（同对象链/单实现/禁反向/过渡边清单锁定/改锚
两行不变行为）。`HANDOFF_READY` 含精确提交、逐路径差量、环境/命令/结果、已知问题、
明确停止写入。C 收停写回执后独立同环境配对根门、集成。全量测试归 C 唯一排队；
提交仅显式暂存批准路径，不 add -A、不 push。
