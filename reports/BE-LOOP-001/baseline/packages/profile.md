# MB-1c · Profile 通用管理包说明（S 段，待 C 审）

基线观察：`work/a3@0578115`。现物理包是 `src/agent_box/server/profiles/`；目标为跨 Harness 的通用 Profile 管理，保留原数据权威和数据根。

**职责**：`ProfileRecords` 管 `server_profiles` 身份、CRUD、CAS 行版本与配置世代；`ProfileService` 校验中立配置、发布对象 digest 并连接 Harness descriptor；`permissions.py` 求值中立 posture；`subagents.py` 管委派授权图；`clone.py` 计算迁移方案；`memory.py` 读既有记忆面。受理冻结由 Session 服务调用、Profile 提供当前可核的记录与规则。

**非职责**：Harness 家族的原生配置翻译、秘密原文保存、执行调度、Work Core 语义、第二份 Profile 存储。`posture_translation.py` 和 `posture_config.py` 当前物理位于此包，但其 claude/codex 原生语义应由 H/S 单独批迁到 Harness 专属域；通用规则不得随走。

**公开/消费接口**：`ProfileRecords`, `ProfileService` 与 `profiles.*` wire 方法是现有消费面。`version`（CAS）、`config_revision`（配置世代）、`config_object_digest`（对象引用）不互换；`server_profiles` 仍在当前 SQLite schema。`model_configs` 管独立 provider/model 表，Profile 只引用；`credentials` 只解析 locator 引用。缩接口前须按所有消费者列出调用点。

**依赖方向**：Profile 通用管理 → Database/ObjectStore、IdempotentRecords、注入的 Harness descriptor/validator 与 ModelConfig 校验端口；Session/Service → Profile。Profile 不 import wire/transport、execution 实现或 Agent 家族插件；原生翻译独立后只从 H 读取中立 posture 输入。

**验证命令**（在同形已验集成树）：`python -m pytest -q tests/server/test_profile_permissions.py tests/server/test_profiles_list_sendability_117.py tests/server/test_profile_memory.py tests/server/test_delegation.py`；另加旧库打开/读出 digest 与 config_revision、CAS 冲突、archived/replay、委派授权及相同 Profile 在不同 Harness descriptor 下 typed validation 的反例。C 同环境根门作失败 ID、ERROR、skip/xfail 差量；不得为绿改公开期望。

**已知缺口/边界反例**：`sessions/repository.py` 仍写 Profile 表运行态列；`profiles/posture_translation.py` 有家族字面量；wire 的 sendability 校验有独立重演。边界验收须证明无新表/回填/双写，无家族分支偷留在通用核心，无循环或双注册；旧兼容 import 若保留必须薄、单向委托且零第二实现。

**现有可跑边界证据**：`tests/test_mb_service_profile_boundary_s.py` 目前 4P，检查通用 Profile 文件未反向 import sessions/wire/transport/bootstrap 或具体插件；绝对和相对禁边都有反例。Profile 表单写、数据不迁与家族分支搬离仍须 MB-2 后按集成树验收。
