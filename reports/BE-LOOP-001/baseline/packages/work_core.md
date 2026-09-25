# MB-1c · `work_core` 包说明（E 输入 v1）

基准：E `90b8a77`。现物理包：`src/agent_box/work_core/`；不是拟新建的空目录。

| 项 | 当前可核事实 |
| --- | --- |
| 职责 | 最小 Work/Execution/Ref 值、生命周期投影/事件、派发与终结事实、幂等与 SQLite 持久化；通过现有 SPI 注册 execution/resource provider，Core 不识别具体 Agent。 |
| 非职责 | Session/Profile/凭据/公开 wire 与产品受理策略；ACP 原生转换、sidecar 进程、runtime/sandbox/terminal/git/skills 实现；资源文件删除策略。 |
| 对外入口 | `work_core/__init__.py` 导出模型、投影、finalization、观察与 SPI；`work_core/services.py` 的 `WorkService`/`ExecutionService`、`repository.py` 的 `CoreRepository`、`db.py` 的 `configure_database` 当前供 Host/E 使用。保持现有符号语义，迁移需兼容接线。 |
| 依赖 | 包内相对导入；`registry.py` 依赖 `resource_contracts.CONTRACT_TYPES` 作兼容 catalog；`db.py` 通过 `runtime.py` 定位迁移与历史默认 DB。Host 在 `server/bootstrap/runtime.py` 注入 DB 路径；`extensions/bootstrap.py` 绑定 provider。Core 不反向 import Server/插件。 |
| 定向验证建议 | `pytest -q -p no:cacheprovider tests/test_work_core_contracts.py tests/test_work_core_repository.py tests/test_work_core_input_dispatch.py tests/test_work_core_finalization.py tests/test_work_core_resource_observations.py tests/test_work_core_responsibility.py`；改动触及装配另加 `tests/server/test_work_core_migration_equivalence_121.py` 和消费钉。命令需在获批实施的同环境基线上比较失败 ID；本研究件未宣称执行过。 |
| 已知缺口 / 暂留 | `runtime.py` 保留历史 `AGENT_BOX_HOME`/`agent-box.db` 默认；`registry.py` 的 catalog 是兼容依赖；Server 的 Session 行与 Core Work/Execution 已共库但权威各在本层，a-3 终合批尚待 C。公开语义、schema 与数据迁移均不随本包说明自动放行。 |

**边界反证**：让 Core import `server.sessions` 会形成上层反向依赖；给新 execution 包复制 `ExtensionRegistry` 会造成重复注册；按 Agent 品牌在 Core 派发会把原生规则偷进通用层。批文/测试应明确拒绝这些形状。
