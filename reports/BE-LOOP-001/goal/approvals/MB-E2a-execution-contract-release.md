# MB-E2a · execution 中立契约等价抽离批文

C · 基线 backend integration `d12aa9791464f1e8c0b680960dc1b126090d1beb` · 契约 C-EXEC@v1。E 为本批唯一产品码写者。E 原 `work/be-goal-execution-0@90b8a77` 已停写；请在 E 组 `work/` 下新建从本基线出发的隔离任务树，先报树路径/HEAD/clean，再实施。原树保留。

允许精确路径：新增 `src/agent_box/execution/__init__.py`、`src/agent_box/execution/contracts.py`、`tests/server/test_e_modular_execution_boundary.py`；修改 `src/agent_box/server/execution/execution_contract.py`、`src/agent_box/server/execution/__init__.py`、`src/agent_box/server/execution/sidecar_backend.py`（合同导入行）。现纯标准库 DTO/enum 和 `TurnExecutionPort` 等原定义只在新 `contracts.py` 留一份，旧入口显式重导出同一对象。若 `TurnExecutionPort` 的实现位置或依赖不符合纯契约，先报告并缩窄本批，勿扩大路径。

S 当前 `sessions/service.py:9` 和 `bootstrap/runtime.py:28` 消费 `server.execution` 的 `CancelOutcome`/`TurnExecutionPort`，旧 import、对象身份、签名和值面必须不变。新 execution 包不得导入 Server、Work Core repository 或 H/P 具体实现；本批不抽 sidecar lifecycle，不动 delegation、Work Core、schema、wire、H/P ports、Profile。S2a 与本批路径不重叠，S 已被要求回执消费要求。

E 跑新旧同对象及 AST 单实现/禁反向依赖反例，`test_e_inc0_block1_pins.py`、`test_e_inc1a_matrix_pins.py`、`test_e_inc1b_b5_pins.py` 等定向对照，并报同环境 FAILED/ERROR/skip/xfail ID；C 收停写回执后串行根门、合入。提交仅显式暂存批准路径，不 push/main，不触用户数据或服务。`HANDOFF_READY` 列精确提交、差量、环境、已知红灯和停止写入。本批不是 execution 生命周期拆分终点。
