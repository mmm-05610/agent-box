# MB-S2a · service facade 等价抽离批文

C · 基线 backend integration `d12aa9791464f1e8c0b680960dc1b126090d1beb` · 契约 C-SERVICE@v1、C-EXEC@v1。S 为本批唯一产品码写者。S 原 `work/a3@df3bb00f` 已停写；请在 S 组 `work/` 下新建从本基线出发的隔离任务树，先报树路径/HEAD/clean，再实施。原树和脏内容保留。

允许的精确路径：新增 `src/agent_box/service/__init__.py`、`src/agent_box/service/facade.py`；修改 `src/agent_box/server/services.py`、`src/agent_box/server/bootstrap/runtime.py`；新增 `tests/server/test_s_mb_service_boundary.py`。`ProductService` 类和所有方法只在新 `facade.py` 有一份实现；旧入口显式重导出同一个类对象。组合根从新入口导入。其余路径须另报。

保持构造签名、readiness 字段、公开错误码/路由和所有方法行为；现有 `server.*` 依赖暂列过渡边，不能宣称 service 已全拆。新包不得反向 import `server.services`；旧/新 `ProductService is` 必须为真。不可添加第二装配、注册或状态。与 E 的 MB-E2a 路径不重叠，S 在本批只消费现旧 `server.execution` 入口，并回执该入口对象身份/签名要求。

S 定向跑 `tests/server/test_wire_v1.py`、`tests/test_block1_cancel_public_shape_s.py`、`tests/test_mb_service_profile_boundary_s.py` 和新边界钉，报告同环境基线与本批 FAILED/ERROR/skip/xfail ID；C 收停写回执后独立串行根门、合入。提交前仅显式暂存上述路径，不 push/main，不触用户数据或服务。`HANDOFF_READY` 要列精确提交、差量、环境、已知红灯和停止写入。
