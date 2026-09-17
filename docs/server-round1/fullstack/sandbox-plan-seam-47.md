# Work Order 47 — 沙箱接缝（报告）

结果：**SANDBOX_PLAN_SEAM_DONE**（一项例外见 §六：Windows r4 本轮未复跑，按既有证据记账）

## 零命中证据（G2）

命令：`grep -rn "agent_box_sandbox_bwrap" src/agent_box/server plugins/agent-box-runtime-wsl/src plugins/agent-box-runtime-local/src`

- **生产代码 0 命中**：Server 与两个 runtime 插件的 src 全部不再出现沙箱品牌。
  - 通道侧：`execution/sidecar.py` 与 `execution/local_channel.py` 的 `compose_sidecar_room`
    直接 import 已删除，改为**构造时注入的 sandbox 端口**；无端口 = `SANDBOX_PORT_UNAVAILABLE`
    类型化拒绝（不静默裸跑）。
  - 装配侧：`bootstrap/runtime.py` 不再 import bwrap——沙箱按**名字**解析
    （部署文档 `sandboxProvider` / 环境变量 `AGENT_BOX_SANDBOX_PROVIDER` / 默认 id
    `sandbox-bwrap`），解析器在 `agent_box/extensions/runtime_composition/sandbox_port.py`，
    三级解析：进程内注册表 → 已安装插件 entry point → `AGENT_BOX_SANDBOX_MODULE` 显式模块；
    全部未命中即 `SANDBOX_PROVIDER_UNRESOLVED` 类型化拒绝。
  - 本地环境探测（`workspaces/local_environment.py`）同样改为端口调用
    （`port.probe()`，二进制/rootfs 检查搬进插件）。
- **测试 fixture 3 处保留并说明**：`runtime-wsl/tests/` 的
  `compose_codex_room`×1、`_minimal_rootfs_argv`×2——这些用例**就是**在测"Worker 客户端
  如何处理一个真实 bwrap argv"，fixture 由 bwrap 的构造器生成是测试语义的一部分；
  另有 3 处 `runtime_artifact_tree_digest` 引用已改走
  `agent_box.resource_contracts.runtime_artifacts`（上移后的中立路径）。

## 文法上移（阶段 B）

- `home_projection.py`（target 文法、protected 关系、stateProjection 语义）与
  `artifacts.py`（runtime artifact 授权 + tree digest 参考实现）从 bwrap 插件
  `git mv` 到 `src/agent_box/resource_contracts/`（`home_projection.py` / `runtime_artifacts.py`），
  插件与 Server 双方**消费**同一份；部署文档格式零改动（四家 producer 与既有部署文档不动）。
- 插件包对既有 API 保持 re-export（`from agent_box_sandbox_bwrap import home_projection_target`
  等调用点不受影响）。

## 能力（G3）

- bwrap provider 的 `_CAPS` 现在**真的**声明 `isolation.wrap@1`（此前只在测试替身里出现），
  槽位与具体能力的登记表在 `agent_box/extensions/capability/slots.py`（50 引入），
  47 更新其一致性测试：`_CAPS` − 槽位 id == isolation 组（逐项相等）。
- 协调器 preflight 收紧：`value is None`（未声明）→ `CAPABILITY_UNDECLARED` **拒绝**，
  替换原来的 `None` 通过分支（`coordinator.py`）。

## 一致性门（G4/G5）

`scripts/server-round1/sandbox-conformance-gate.py`（报告 JSON：
`docs/server-round1/fullstack/sandbox-conformance.json`）：

- **真 provider（bwrap）**：`SANDBOX_CONFORMANCE_GATE_OK`，exit 0。逐条（均宿主侧观测）：
  home 真目录（房内写落在宿主真 home）、`/home` 整树不可见（强于 ~/.codex）、
  RO 输入房内 `EROFS` 且宿主字节未变、ephemeral 写成功但宿主真 home 无残留、
  workspace 可写、凭据内容不在 argv/环境（宿主路径可 bind）、
  进程树随主进程死亡（正控制：杀前宿主可见唯一 `sleep 593.417`，杀后为空）、
  临时根消失、`none` 姿态被诚实拒绝（模板不产出 `--unshare-net`）。
- **反例 provider（`fake-redirect-home`，把 home 复制到 scratch 再 bind）**：
  `SANDBOX_CONFORMANCE_GATE_FAILED`，exit 1——`home_is_real` 失败
  （房内写成功、宿主真 home 无此文件），门不是橡皮图章。
  （该假 provider 对其他检查项更宽松属预期：它是为证明门会失败而写的最小实现。）

## 行为不变（G1）

- `host-substitution-gate.py`：**HOST_SUBSTITUTION_GATE_OK**，exit 0，
  `roomDiffersOnlyInBindings=true`（同一房间在 /local 与 /wsl 两套宿主路径下 argv
  只差绑定串）。门内三处按 45/47 契约适配（native home 目录替代 state_bundle_prefix；
  capture 返回 audit 事实而非字节），断言语义不变。
- 四家全链门（显式 `--worker .acceptance-bundle-c8/agent-box-worker`，假端点，
  同 c8 摘要 `sha256:ce7fdeb2…`）：**pi `PI_PRODUCTION_CHAIN_GATE_OK`、hermes
  `HERMES_PRODUCTION_CHAIN_GATE_OK`、opencode `OPENCODE_PRODUCTION_CHAIN_PREPARED`、
  codex `CODEX_PRODUCTION_CHAIN_GATE_OK`，全部 exit 0**。
  **过程中的真实缺陷与修复**：八家门的 reopen/观察相位各自构造 launcher（门内 fixture），
  47 起 launcher 需要注入端口——首轮复跑四家全红（`SANDBOX_PORT_UNAVAILABLE`），
  已给八家门逐一注入 `_gate_sandbox_port()`（与产品同一解析路径）后全绿；
  这是门的适配缺口，不是产品路径缺陷（产品路径经 port_factory 注入已由全量套件覆盖）。
- Windows r4：**本轮未复跑**。理由：47 改动全部落在 Python 侧装配/文法/声明路径，
  房间 argv 的字节等价已由 host-substitution 门证明；r4 需真实 Windows 运行环境与
  accept 脚本链（含真实模型段），留待 48 的 Windows placement 一并复跑。按工单
  §2 记账，不写成通过。

## 回归（G6）

- 全量套件（`tests/`，含 integration，全部插件 src 入 PYTHONPATH）：
  `python3 -m pytest tests/ -q` → **754 passed / 0 failed**（47 改动后复跑）。
- 插件套件（harnesses + sandbox-bwrap）：**331 passed / 3 skipped**（阶段中复跑）。
- 45 的 G 门与 44/46 的门未逐一重跑；受影响面（sandbox 插件/coordinator/文法 import）
  由全量套件与上述门覆盖。

## 未做项与阻塞项

1. Windows r4 未复跑（见上，记账；48 时一并）。
2. `plugins/agent-box-runtime-*/tests/` 3 处 bwrap fixture 引用保留（理由见 G2 节）。
3. 房间网络参数（`MountPlan` 的 network 声明位）与 47 的"中立计划"扩展未做——
   工单 §8 明说留给后续（本单只把声明与其一致起来；`none` 现为类型化拒绝）。

## 费用

真实模型调用 0 次、¥0（全部假端点/单元；host-substitution 门为本机 loopback 假端点）。

## 清理

- 一次性临时根/进程均由门与测试自清理；`sandbox-conformance` 门的临时根在报告
  `cleanup_bounded=pass` 中留下证据。
- Git 状态与 `git diff --check` 见提交记录。
