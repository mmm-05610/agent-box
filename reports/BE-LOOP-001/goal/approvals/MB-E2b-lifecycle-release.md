# MB-E2b · execution lifecycle 中立协调账等价抽离批文

C · 2026-09-22 14:1xZ · 基线 backend integration
**`0c042f5499d1f8ebc843327f730bc529be065a14`**（kilo 后 HEAD，`CP-H-KILO.md`）。
E 为本批唯一产品码写者。请在 E 组 `work/` 下新建从本基线出发的隔离任务树（新分支），
先报树路径/HEAD/clean，ACK 后实施。原 `work/e2a`（已闭）不续写。

依据：你方 `reports/E-E2b-lifecycle-prereport-v1.md`（读码基准 `a67c67c9` 与现基线间
`sidecar_backend.py`/`first_run_lock.py` 零变化，采信）。**三开放问题裁定**：
①命名采纳提案（`NeutralRun`＋`NeutralRunTracker`；旧 `_NeutralRun` 属性继续指同一
对象，身份钉覆盖）；②`first_run_lock` **同批**（纯 stdlib 逐字移，薄重导出）；
③业务 run 注册采 **opaque 属性契约**（`cancel_lock/cancel_confirmed/port`）进同一
cancel 状态机——禁止双状态机；`_Run` 类不迁，留 adapter。

## 允许的精确路径（5 条，其余须另报）

新增 3：
- `src/agent_box/execution/lifecycle.py`（`NeutralRunTracker` 单实现：占键/释放/重放、
  三态 cancel、observe 分类、证据追加、两账一锁；导入仅 stdlib＋
  `agent_box.execution.contracts`；port 全 opaque）
- `src/agent_box/execution/first_run_lock.py`（现 `server/execution/first_run_lock.py`
  逐字等价移动）
- `tests/server/test_e_modular_execution_lifecycle.py`（先报 §5 钉：同对象/AST 单实现/
  账别名 `backend._neutral_runs is backend._lifecycle.runs`/导入方向 allowlist 扩钉
  ＋三红探针）

修改 2：
- `src/agent_box/server/execution/sidecar_backend.py`（`_NeutralRun`/首跑锁改自新包导
  入同一对象；`submit/cancel_execution/observe_execution/_neutral_event` 四方法薄单向
  委托；`_neutral_runs`/`_cancel_receipts` ＝tracker 同一账对象的别名属性，保既有
  pins 属性面；业务 run 以 opaque 契约注册）
- `src/agent_box/server/execution/first_run_lock.py`（→纯重导出载体：
  `first_run_gate`/`FirstRunLockTimeout`/`FIRST_RUN_WAIT_SECONDS` 同对象）

明确排除（先报 §2 清单全数生效）：accept/_start_run/_native_event/_complete/_retire_run/
stop/pid_for/_CoreSidecarProvider/_capability_gate 等业务与装配层、`delegation.py`、
`sidecar.py`/`local_channel.py`/`ssh_connector.py`/`placement.py`/`state_capture.py`/
`session_store_guard.py`/`usage.py`/`artifact_store.py`/`change_set.py`/`inventory.py`/
`control_plane_sync.py`、`extensions/**`、schema/wire/Work Core/Profile/H/P。
若实施中发现 `src/agent_box/execution/__init__.py` 须加导入行（对象身份/序列化原因），
先报后改，不自行扩路径。

## 等价与边界要求

- 同对象：新旧 `_NeutralRun`/`first_run_gate`/异常类/常量 `is` 真；
  `SidecarExecutionBackend` 类对象、公开签名、`CancelOutcome` 三态值面全不变。
- 单实现：三态 cancel/占键/重放/observe 分类仅 tracker 一处；backend 零第二份账
  （别名引用非副本）。禁反向边：`agent_box.execution.*` ↛ server/sessions/profiles/
  wire/work_core/extensions/插件。
- 消费面：`cancel_execution` 4 调用点（sessions×2、wire×1、stop 自调×1）与
  `delegation.py:205` accept 行为零变化；`submit/observe` 生产零消费（契约先行）。

## 验收

E 定向（同环境，报基线与本批 FAILED/ERROR/skip/xfail ID 对照）：先报 §5 六件既有钉
文件 **0 断言改动**全绿＋新 lifecycle 钉全绿＋红侧三探针实录＋全树 `--collect-only`
零错。`HANDOFF_READY` 含精确提交、逐路径差量、环境/命令/结果、已知问题、明确停止
写入。C 收停写回执后同环境配对根门、集成。全量测试归 C 唯一排队；提交仅显式暂存批
准路径，不 add -A、不 push。本批仍不是 execution 拆分终点（sidecar/local_channel 等
另批）。
