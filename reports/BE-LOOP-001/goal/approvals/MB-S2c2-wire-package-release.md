# MB-S2c2 · wire 物理包等价抽离批文

C · 2026-09-22 14:3xZ · 基线 backend integration
**`321c883cac8aa0fbb5e83a9ff76802533c20a0a4`**（S2c1 后 HEAD，`CP-S-S2c1.md`）。
S 为本批唯一产品码写者。请在 S 组 `work/` 下新建从本基线出发的隔离任务树（新分支），
先报树路径/HEAD/clean，ACK 后实施。`work/s2c1`（已交付）与其他旧树不续写。

依据：你方 `MB-2-S-exact-scope-proposal.md` S2-c2 节＋本批文。方案＝唯一实现搬迁＋
M1-P-A① sys.modules 同对象 shim（s2c1 已验收纪律），零行为变化、零 schema/公开
wire 语义变化（wire/1 面逐字节等价）。

## 允许的精确路径（13 条，其余须另报）

新增 6：
- `src/agent_box/service/wire/__init__.py`
- `src/agent_box/service/wire/handlers.py`
- `src/agent_box/service/wire/projection.py`
- `src/agent_box/service/wire/envelope.py`
- `src/agent_box/service/wire/errors.py`
- `tests/server/test_s_mb_wire_boundary.py`

修改 7：
- `src/agent_box/server/wire/__init__.py`（→包 shim：子模块 sys.modules 预注册）
- `src/agent_box/server/wire/handlers.py`（→子模块 shim）
- `src/agent_box/server/wire/projection.py`（→子模块 shim）
- `src/agent_box/server/wire/envelope.py`（→子模块 shim）
- `src/agent_box/server/wire/errors.py`（→子模块 shim）
- `src/agent_box/server/bootstrap/runtime.py`（仅 `:34` 导入行改锚）
- `src/agent_box/server/transport/http/app.py`（仅 `:17-18` 导入行改锚；路由路径与
  序列化函数原样）

等价改写 allowance：新实现文件与原文件 diff 仅限**包内互导改锚行**（如
`server.wire.projection`→`service.wire.projection`），逐文件把 diff 行数与内容入钉；
其余逐字节。**明确不动**：全部测试文件（含经 `agent_box.server.wire` 子模块属性消费
的 086/097/098/101/117/128/129/135/147、brand_rename 等——同对象纪律保零改）；
`delegation.py`、`storage/**`、sessions（已闭）、Profile、E/H/P 文件；公开错误码/
路由/wire/1 JSON/error/status/frame/cursor 面；`_handlers` 注册表内容与键集。

## 等价与边界要求

- 旧/新 `WireService`/`WireError`/`CursorCodec`/`WIRE_VERSION`/`FAMILIES` 等名字与
  模块对象 `is` 全等；`_handlers` 键全集与唯一性钉；旧五文件零 `def`/`class`。
- `agent_box.service.wire` 禁 import `server.wire`；过渡边（对 `server.*` 共享设施/
  sessions/profiles 等的实际 import）以实搬 diff 为准**精确集合入钉**，不假称已净。
- `handlers.py` 现承载的 Profile/asset 用例职责**不因位置移动宣称已纯**——本批只搬
  位置，域内服务接口拆分另批。禁新增装配/注册/状态。

## 验收

S 定向（同环境，基线与本批同命令对照 FAILED/ERROR/skip/xfail ID）：wire_v1＋
086/097/098/101/117/128/129/135/147/brand_rename＋server_boundaries 等现有 wire 面
**零改全绿**＋新钉全绿＋逐文件字节/diff 行数证据。`HANDOFF_READY` 五要素齐＋明确
停止写入。C 收停写回执后同环境配对根门、集成。全量测试归 C 唯一排队；提交仅显式
暂存批准路径，不 add -A、不 push。S2-c3（transport/组合根收口）候本批后再判。
