# MB-1c · service 包说明（S 段，待 C 审）

基线观察：`work/a3@0578115`；目标是已有 `server` 的协议入口、会话与业务编排域。当前为逻辑包，`services.py`、`wire/`、`transport/http/`、`sessions/` 和 `bootstrap/runtime.py` 分散承载；不创建空 `service/` 目录充数。

**职责**：接入 HTTP/wire、将请求交给单一用例服务、会话/turn 受理与冻结、队列与生命周期侧持久化、按已注入端口调用执行、以装配事实回答 readiness。`bootstrap/runtime.py` 是唯一组合根；`ProductService` 是 HTTP 中立 facade；`WireService` 拥有 wire/1 分发和投影。

**非职责**：Work Core 语义与执行策略、Harness 原生协议、Agent 品牌配置翻译、资源插件内部实现、Profile 数据的第二权威。service 不持凭据内容，不做真实计费调用。

**公开/消费接口**：现有 HTTP `/wire/v1/{method}`、有限 REST `/api/v1/**`；Python 消费 `build_runtime`, `ServerRuntime`, `ProductService`, `SessionService`, `SessionRecords`, `WireService`。这张表描述现有入口，不授权新增 wire 字段或错误码。兼容入口只能委托唯一新实现。

**依赖方向**：transport → facade/wire → sessions/Profile/Workspace/approval 等服务；sessions → `TurnExecutionPort`、Harness descriptor、Profile 中立权限求值、Database/ObjectStore；组合根 → 所有被装配包。Work Core/执行不得反向依赖 transport/wire。当前 `sessions/repository.py` 写 Profile 表运行态三列，需在 MB-2b/2d 中收窄接线，保留原事务。

**验证命令**（在同形已验集成树，使用该环境可加载的 Python/pytest）：`python -m pytest -q tests/server/test_wire_v1.py tests/server/test_a3_k2_filing_s.py tests/server/test_e_inc1b_b4_pins.py`，再跑 package import/装配与重复注册反例。需要按 C 根门对同环境基线逐 FAILED-ID、ERROR node-id、skip、xfail 比较；本 S 报告中 wire 的本机 capability 红不能当作产品新增失败。

**已知缺口/边界反例**：service 目前不是单一物理目录；`bootstrap/runtime.py` 很大且含 native/home 适配；`WireService` 分发表集中。反例为搬出后旧入口仍实现一次、新入口再实现一次，或导入环令启动依赖顺序偶然生效。MB-2a/2c 批文应钉唯一实现与无环装配。

**现有可跑边界证据**：`tests/test_mb_service_profile_boundary_s.py` 目前 4P，检查 service 入口未 import 具体插件，`WireService._handlers` 没有重复字面键；函数内具体插件导入与重复键均有反例。运行时双注册、全图循环仍待实施批验证。
