# MB-1c · execution 包说明（E 补件 v1）

观测基准：E `work/be-goal-execution-0@90b8a77`。本件描述现状与目标边界；S/H/P 归属和产品码拆分仍待 C 逐路径批文。

| 六项 | 内容 |
| --- | --- |
| 职责 | 接收调用者给出的不透明 `execution_key` 与冻结输入，协调一次派发、观察、取消和清理；将已知回执、未知结果及补偿事实如实返回。`server/execution/sidecar_backend.py` 当前实现 `TurnExecutionPort` 与 Core dispatch 接线；`extensions/runtime_composition/coordinator.py` 当前协调注入的 runtime/sandbox/terminal ports。 |
| 非职责 | 不创建/解释 Session、Profile、公开 wire 或业务终态，不定义 ACP 原生语义，不实现底层进程、沙箱、终端、工件删除或凭据解析，不维护第二套 Work Core/注册表/账本。`delegation.py` 现含产品委派规则，暂按混置现状登记，不把它当作中立 execution 成果。 |
| 公开消费接口 | S 通过 `server.execution.TurnExecutionPort` 使用 `accept`、`submit(ExecutionRequest)`、`cancel_execution`、`observe_execution`；当前 `CancelOutcome`、`ExecutionReceipt`、`ExecutionObservation` 等定义在 `server/execution/execution_contract.py`，由 `server/execution/__init__.py` 重导出。`sessions/service.py` 与 `bootstrap/runtime.py` 消费旧入口。C-EXEC@v1 的返回语义和对象身份不得在搬家时变。 |
| 依赖方向 | `service/S` → `TurnExecutionPort` → `execution/E` → Work Core 的既有 SPI/事实；execution 只通过已声明 C-RUNTIME/C-RES/C-HARNESS port 调 P/H。Host 在 `server/bootstrap/runtime.py` 装配具体端口并注入 Core DB 路径。Core 不反向 import Server；新 execution 包不得 import `server.sessions/profiles/wire` 或具体 H/P 插件。 |
| 定向测试命令 | E `90b8a77` 上，从 `source/`：`PYTHONPATH=src:plugins/agent-box-runtime-wsl/src:plugins/agent-box-sandbox-bwrap/src ../tmp/venv/bin/python -m pytest -q -p no:cacheprovider tests/server/test_e_inc2a_runtime_verbs_pins.py tests/test_runtime_composition_protocol.py` → **11P/0S，exit 0**。中立 verb/取消/并发须另跑 `tests/server/test_e_inc1a_matrix_pins.py`、`test_e_inc1b_b5_pins.py`；a-3 身份消费须在 C 的合批基线上跑，E 单树 schema v20 的缺列红不能冒称实现失败。全量由 C 排队。 |
| 已知缺口 | `sidecar_backend.py` 同时容纳产品 Turn adapter 与中立 verb 状态；`server/execution/__init__.py` 同放 Harness descriptor/registry；`sidecar.py`、`local_channel.py`、`ssh_connector.py` 以及 `extensions/runtime_composition/**` 的 H/P/E 逐文件归属待会签。旧导入面和测试中的私有观察点需薄兼容，不得双实现。`CP-a3`/MB-2 批文未到，尚无模块化产品码差量。 |

**物理状态**：`server/execution/` 已有物理包，但与 service/原生 transport 混置；中立契约当前位于 Server 命名空间。首个物理抽离候批见 `reports/E-MB2-first-batch-v2.md`。Work Core 是另一个已有物理包，保持稳定。
