# Work Order 47 — 沙箱接缝：上层提需求，下层翻译（消费已有协议）

状态：**READY_FOR_EXECUTION**（用户 2026-09-16 批准方向与改动面）。
基线：46 收工提交。依赖：44 / 45 / 46（同一工作树串行）。
背景与证据：[windows-placement-provider-candidates.md](../../server-round1/windows-placement-provider-candidates.md)
（Windows provider 只在这个接缝之后才挂得上）。

## §0 目标

**一句话**：让"要沙箱"的一方只表达**需求**（哪些只读、哪个可写、哪些临时、凭据怎么给、网络什么姿态、
home 必须是真实目录），由**已解析的沙箱 provider**翻译成自己的执行方式；上层不再 import 任何具体沙箱，
也不再自己拼 bwrap 命令行。

**验收（第一手证据）**：

| 门 | 断言 |
| --- | --- |
| **G1 行为不变** | bwrap 作为第一个走协议的实现，四家全链门（c9 之后）与 Windows r4 复跑 exit 0；`host-substitution-gate.py` 仍 exit 0（argv 字节不变这条**保留**为"协议没有改变行为"的证明） |
| **G2 上层不认识 bwrap** | `src/agent_box/server/**` 与 `plugins/agent-box-runtime-*/**` 里 `grep -rn "agent_box_sandbox_bwrap"` **零命中**（死代码 `legacy_codex.py` 一并处置，见 §2.E）；Server 启动与一次执行都不需要知道沙箱是谁 |
| **G3 能力不再自报** | 沙箱真的声明 `isolation.wrap@1`；协调器 preflight **把"没声明"当拒绝**（不是今天的 `None` 通过）；`isolation.wrap@1` 与 `_CAPS` 两套词汇的对应关系写进代码与测试 |
| **G4 一致性门** | 新增 `scripts/server-round1/sandbox-conformance-gate.py`：对**任何** provider 检查同一组不变量（home 真实可写 / 用户的 `~/.codex` 读不到 / RO 输入写不动 / 临时路径不留痕 / 凭据不在 argv / 进程关闭即杀 / 清理有界 / 网络姿态与声明一致）；bwrap 过门 |
| **G5 门不是橡皮图章** | 同一门对**一个故意违规的假 provider**（把 home 做成重定向层）必须**失败**（反例留证） |
| **G6 不退化** | 全量套件 ≥ 46 收工时的计数；45 的 G1–G8、44/46 的门不退化 |

## §0b 位置

工作树 `/home/maoqh/projects/agent-box-env-provider`，分支 `feature/env-provider-v1`
（与 44/45/46 同一工作树、同一执行者串行）。父工作树、扩展工作树、前端仓只读。
不 reset/stash/clean、不 merge main、不 push。

## §1 现状（第一手，逐条给位置，就是本单要拆的东西）

1. **通道自己挑了沙箱**：`execution/sidecar.py:316` 与 `execution/local_channel.py:25` 直接
   `from agent_box_sandbox_bwrap import compose_sidecar_room`，并在 `:366` / `:106` 调用它拿到
   现成 argv。→ 上层的"需求"是隐式的，写死在调用点里。
2. **host provider 也是硬 import**：`bootstrap/runtime.py:139 from agent_box_runtime_wsl import WslConnector`；
   而 `runtime-local` 虽然声明了 `process.spawn.typed@1`（`provider.py:261`），产品路径也没走它
   （local channel 直接用 `subprocess`）。
3. **布局文法住在沙箱包里**：`bootstrap/runtime.py:727/739/784` 从 bwrap 包 import
   `home_projection_target` / `protected_state_paths` / `HomeProjectionRejected` 等。部署文档的
   `stateProjection.target`、`projectionFiles.target`、`nativeHome` 全是按这套文法写的。
4. **正式协议没人消费**：`MountPlan`（挂载 + tmpfs + secret 物化方式）、
   `Sandbox.wrap(mount_plan, command, attempt_key) -> IsolatedProcessSpec`、
   `HostTransportOperation`（类型化操作）都在 `extensions/runtime_composition/protocol.py` 里，
   但产品链（`__main__` → bootstrap → sidecar 通道）**从不调用协调器**。
5. **两套能力词汇没对上**：协调器 preflight 查语义名 `isolation.wrap@1`（`coordinator.py:65`），
   真实 bwrap 插件只声明 `_CAPS` 那 10 条具体名（`provider.py:25`），
   **`isolation.wrap@1` 在真插件里零命中**（只出现在测试替身 `fake.py:49`）。
6. **判定过松**：preflight 的 `value not in (SUPPORTED, "supported", None)` —— **没声明 = 通过**。
7. **死代码隐患**：`legacy_codex.py:48-49` 也 import 了 bwrap 与 runtime-wsl（生产装配无引用，
   但复活即重新绑死）。

## §2 要改的地方（逐文件，按阶段）

### A 让产品路径走协议（bwrap 作为第一个实现）

| 位置 | 现在 | 改成 |
| --- | --- | --- |
| `execution/sidecar.py`（`:316`、`:366`）与 `execution/local_channel.py`（`:25`、`:106`） | 自己 import 并调用 bwrap 的 `compose_sidecar_room` | 构造时**注入**一个沙箱端口；调用点只递交"需求"，拿到 `IsolatedProcessSpec`（argv + 环境）后照旧执行；通道内**不得出现**任何沙箱专有名词（`state_bundle_prefix` 这类词按需换成中性事实） |
| `execution/placement.py` | 只解析"通道"（wsl / local） | 扩成解析**通道 + 沙箱 provider + host provider** 三元组（可另立 `sandbox_resolution.py`），解析依据来自配置/部署文档，不再 import 具体插件 |
| `bootstrap/runtime.py`（`:139`） | 硬 import `WslConnector` | 按解析结果拿 host provider（`runtime-wsl` 需要补一条 entry point 或注册路径，见 §2.C） |
| `bootstrap/runtime.py`（`:727/739/784`） | 从 bwrap 包 import 布局文法 | 从契约层取（见 §2.B） |
| `plugins/agent-box-sandbox-bwrap/.../provider.py` | `_CAPS` 10 条具体名，无 `isolation.wrap@1` | 声明 `isolation.wrap@1`；把"语义名 ↔ 具体名"的对应写成代码常量 + 测试（例如 `isolation.wrap@1` = 能在本 provider 上满足 `filesystem.*` 那一组） |
| `extensions/runtime_composition/coordinator.py:65` | 缺省算通过 | 语义能力**必须显式声明**；缺席 → 类型化拒绝（新码 `CAPABILITY_UNDECLARED` 或复用 `CAPABILITY_UNAVAILABLE`，选定后写进测试） |
| `extensions/runtime_composition/protocol.py`（或 `resource_contracts/`） | `MountPlan` 只有 mounts/tmpfs/secret | 需求侧补齐**不变量声明位**：`home` 必须**真实目录**（重定向型沙箱必须**显式拒绝**而不是假装满足，用 `SandboxUnsupported`）、工作区 RW、RO 输入、临时路径（相对 home 的相对路径）、网络姿态、凭据"不进 argv" |

### B 布局文法上移（不改部署文档格式）

- 把 target 文法（`GUEST_HOME`、段规则、深度、protected 关系、`stateProjection` 语义）从
  `plugins/agent-box-sandbox-bwrap/.../home_projection.py` 移到
  `src/agent_box/resource_contracts/`（或 `extensions/runtime_composition/`），bwrap 插件改为**消费**它；
  Server 侧 `runtime.py:727/739/784` 从同一处取。
- 沙箱 provider 声明自己的 **guest 根映射**（`home` / `workspace` / `artifacts` / `bin` / `view`）。
  **部署文档格式保持不变**（沿用现有拼法），但校验从"字符串写得对"变成"与该 provider 声明的根一致"。
  （这样四家 producer 与既有部署文档不用改；若某 provider 无法表达这套根，再单议角色化 target。）

### C plugin/host 注册

- `agent-box-runtime-wsl` 目前**没有 entry point**（`pyproject.toml` 里 0 个），只能被 import；
  给它补上注册路径（entry point 或显式注册表），让解析器能按名字拿到它。
- 解析器**不猜**：解析不到就类型化拒绝（`PLACEMENT_UNIMPLEMENTED` 家族已有先例）。

### D 一致性门（新）

`scripts/server-round1/sandbox-conformance-gate.py`：

- 输入：provider 名（或一个实现了沙箱端口的测试实现）+ 一次性 workspace/home/RO 输入/临时路径；
- 检查（每条都要第一手证据，写进 JSON）：home 是**真实目录**且可写；执行进程**读不到**用户的
  `~/.codex`（用一个哨兵文件）；RO 输入写不动；临时路径在执行后**没有留痕**；凭据**不在 argv**；
  进程关闭即杀（不留孤儿）；清理有界（临时根消失）；网络姿态与声明一致（`none` 时连不出去）；
- **反例（G5）**：一个刻意把 home 做成重定向层的假 provider 必须被门判失败。

### E 收口

- `legacy_codex.py`：**删除**（生产装配无引用；留着就是"复活即重新绑死"的隐患）。**注意：它不是纯死代码**——`tests/server/test_stage_c_codex.py` 与 `tests/server/test_stage_c_windows_wsl_offline.py` 都 import 它，删除要连这两个测试一起处理（或把它们改成显式"历史保留"并断言不再被生产装配引用），不得只删实现留下 import 错误。
  - **已由工单 49 提前完成**（2026-09-17）：`src/agent_box/server/legacy_codex.py` 与上述两个测试文件一并删除（实现 423 行 + 测试 639 行；全仓引用仅这两个测试，无生产引用）。本单 E 阶段不再重复此项。
- `docs/server-round1/runtime-host-layer-boundary.md` 补一节："协议被消费之后的分层"（把 A–D 的
  实际形状写进去，纠正该文档里"协调器没人调用"的现状描述）。
- status 分账 + 费用（本单默认零真实模型调用）。

## §3 硬性规则

- **不碰 wire**（28 方法、`wire/1`、事件 kind 与载荷）；**前端仓只读**。
- **部署文档格式在本单内不变**（零宿主路径这条继续成立）；若确需格式变更 → 停下记录，交用户裁决。
- 行为不变是**硬指标**：`host-substitution-gate.py` 与四家全链门的 argv 字节断言必须继续通过。
- 45 的三条规则（只读配置 / tmpfs 遮蔽 / 受保护路径）与 G1–G8 不得退化；44/46 的门不得退化。
- 能力**不得自报**：没有观测证据的能力声明 false；本单新加的门就是观测手段。
- 不 reset/stash/clean、不 merge main（46 §1b 那次是唯一例外）、不 push。

## §4 阶段

- **A** 协议消费（注入沙箱端口 + 通道去 bwrap 词）+ 能力词汇统一 + preflight 收紧（G2/G3）；
- **B** 文法上移 + guest 根映射声明（部署文档不动）；
- **C** host provider 注册（`runtime-wsl` entry point / 显式注册）；
- **D** 一致性门 + 反例（G4/G5）；
- **E** 回归（G1/G6）+ 收口（死代码、文档、status）。

## §5 六件套 DoD

1. 实现（A–C 的提交）；2. 定向测试 + 反例（能力缺席必须拒、重定向型假 provider 必须被门判失败、
   解析不到类型化拒绝）；3. 一致性门证据（JSON + 退出码）；4. 回归计数（四家全链门、Windows r4、
   全量套件、`host-substitution-gate`）；5. status 分账；6. 清理证据（临时目录、进程、Git 状态、
   `git diff --check`）。

## §6 阻塞账格式

与 46 §7 相同（现象 / 第一手证据 / 影响面 / 已尝试 / 为什么复杂 / 建议 / 当前状态）。

## §7 最终报告格式

```text
结果：SANDBOX_PLAN_SEAM_DONE 或 SANDBOX_PLAN_SEAM_PARTIAL
零命中证据：grep agent_box_sandbox_bwrap 在 src/agent_box/server 与 runtime-* 插件的结果（G2）
能力：沙箱声明的语义能力与具体能力对照；preflight 收紧前后的判定差异（G3）
一致性门：逐条不变量的证据 + 反例结果（G4/G5）
行为不变：host-substitution-gate、四家全链门、Windows r4（bundle 摘要逐条）
回归：全量套件计数
未做项与阻塞项：逐条
费用：模型请求数 / 金额（默认 0 / ¥0）
清理：临时目录、进程、Git 状态
```

## §8 边界

- **Windows provider 不在本单**：本单只把接缝做成"任何沙箱都能挂"，并让 bwrap 证明它成立；
  AppContainer 实现是 48（候选与 spike 四问见 windows-placement-provider-candidates.md §5）。
- **回父分支**：仍是之后单独一步。
