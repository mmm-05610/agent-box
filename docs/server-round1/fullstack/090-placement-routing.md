# Work Order 090 — 放置路由：WSL 工作区的执行去 WSL worker（否则派发前类型化拒绝）

终态：见本树 `status.md` 090 行。**PARTIAL**（代码/门全绿；仅"真机 WSL worker 跑一轮"受本机环境限制未跑，见 §4）。

## 1 症状与落点（阶段 1，对照 46 门条件）

试用一手（工单 `Current state`）：Windows 宿主 + 标准数据根 + WSL worker ⇒ 一轮**没有**路由到 WSL worker，
回退宿主默认 `sandbox-windows`（`runtime.py:861 _default_provider = "sandbox-windows" if os.name=="nt"`）
→ `resolve_sandbox_port` 抛 `SANDBOX_PROVIDER_UNRESOLVED` → 该异常从 `port_factory`（在 `_start_run` 内、
`open_execution` **之前**）冒出 → `provider.start` 把它当**普通异常** → `work_core/services.py:211-216`
记 `ExecutionDispatchAmbiguous`（`fail_turn(_safe_code)` 只得基线 `EXECUTION_FAILED`）。
**一次放置明确的执行不该走到"模糊派发"。** 两处落点：
① `_default_provider` 用**宿主** `os.name` 决定沙箱，而非**放置所在机器**（guest 是 Linux）；
② 放置/沙箱这类"零原生副作用"的确定性拒绝，落进了 ambiguous 而非 typed-failed。

## 2 修法（阶段 2，均在 `write_paths` 内）

`src/agent_box/server/bootstrap/runtime.py`：
- 新增 `_sandbox_provider_name(deployment, placement_kind)`：wsl/ssh ⇒ `sandbox-bwrap`（guest Linux，
  与控制面宿主无关，R-0014）；local ⇒ 宿主规则（nt→windows 否则 bwrap）；显式 `sandboxProvider`/
  `AGENT_BOX_SANDBOX_PROVIDER` 优先。**两处逐执行调用点**（`port_factory` 与 `_capability_material`）
  同源于此，杜绝"宿主默认"把 WSL 轮引到 windows。

`src/agent_box/server/execution/sidecar_backend.py`：
- `_CoreSidecarProvider.start` 增 `except (PlacementUnsupported, SandboxPortUnavailable)` →
  转 `ExecutionStartRejected`（挂 `.code`），走既有 `record_dispatch_failed`（与能力门同一条"启动未发生"缝）。
  ⇒ `accept` 的 `fail_turn(_safe_code)` 沿 `__cause__` 取回**类型化码**，**不再是** `DispatchAmbiguous`。
  post-open 的 `SidecarError`（同名码）不在此列，歧义语义原样保留（见 D-R3-001 对照测试）。

## 3 门（阶段 3，定向 `-k "placement or sandbox"` → 15 passed）

- **G1 正确路由（不落宿主默认）**：
  `test_sandbox_default_follows_the_placement_not_the_host`（`_sandbox_provider_name` 在 `os.name=="nt"` 下，
  wsl/ssh→bwrap、local→windows、显式 provider 胜）；
  `test_a_wsl_turn_still_routes_to_the_worker_from_a_windows_host`（产品路径 `port_factory` 于
  `host_os="nt"` 下为 wsl 造出 **WorkerSidecarLauncher**＝worker 通道、抓到 connector 痕迹；
  **未修前**此调用抛 `SandboxPortUnavailable`→红，门咬）。
- **G2 派发前类型化拒绝（非 DispatchAmbiguous）**：
  `test_an_unresolvable_placement_is_a_typed_refusal_not_an_ambiguous_dispatch`：port_factory 抛
  `SANDBOX_PROVIDER_UNRESOLVED` ⇒ turn `failed` 且 `error_code=="SANDBOX_PROVIDER_UNRESOLVED"`；
  Core 账本 `ExecutionDispatchFailed` 在、`ExecutionDispatchAmbiguous` **不在**（去掉 `start` 转换即翻红）。
- **G3 可复现 / 两侧条件对照**：见 §1（宿主默认 vs 放置）与 §4（真机条件对照）。

## 4 真机 WSL worker 一轮（本机限制，如实登记）

本执行环境在 Linux/WSL 内，**没有可连的 Windows 宿主 + 真 WSL worker**。仓内真机腿
`test_real_worker_state_projection_resumes_two_fresh_sidecars` 等需预置 `agent-box-worker` 二进制 + `bwrap`，
本轮**跳过**（插件/服务端套件 skip）。⇒ G1 的"经 WSL worker 有痕迹"以**产品路径通道选择**（`port_factory` 造
worker launcher + connector 痕迹）证明；"真跑一轮拿到原生回执"未跑，记为 090 精确剩余。
**若差异确在部署文档（缺 `sandboxProvider`/placement-environment 绑定）需交回调度者**：本单不改 46 门部署文档，
已把"宿主默认 vs 放置默认"的对照钉进 §1。

## 5 §Spend / 清理 / 回归

真实模型调用：0；真 `wsl.exe`/worker：0（全 monkeypatch）。清理：无残留。
回归：090 只动 `runtime.py`（沙箱默认来源）与 `sidecar_backend.py`（start 拒绝转换）；
对照测试（能力门 failed / post-open ambiguous）仍绿，未改队列/幂等/CAS/wire。全量套件计数见批末报告。
