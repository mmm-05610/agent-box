# Work Order 50 — 按内容吸收能力层（CAP-01），并把 `network.none@1` 的假声明收敛

状态：**READY_FOR_EXECUTION**（用户 2026-09-16 批准"吸收不并史"；实现未开始）。
**前置：46（共享文件静默）之后、47 之前**——47 要在这层之上做语义投影，不许各造一套词汇。
依据：对 `feature/capability-entry-v1`（HEAD `1c74d15`）的只读阅读（2026-09-16），
见 §1 的清单与 [49 §8](49-evidence-hygiene.md)。

## §0 目标与验收

**目标**：把那条分支里**有价值的部分按内容移植**到当前线，**不合并它的历史、不娶它的调度**；
顺带收敛一条我们树上真实的过度声明。

**验收（第一手证据）**：

| 门 | 断言 |
| --- | --- |
| **G1 移植等价** | 移植的库 + `declarations.py` + 全部测试**逐条通过**，计数记入；除签名适配外**不得改断言语义**，任何改动逐条说明理由 |
| **G2 装配接线** | 声明文档**逐执行**构造（targets 与 launcher 同源），装配边界把它注入端口；未批准 provider 的声明 → **fail-closed 拒绝**；反例：伪造 provider 的声明文档必须被拒 |
| **G3 反自报** | 声明文档的 provider 必须命中**显式批准映射**（"已安装/已加载"不构成授权）；授权来源 = 部署文档的显式字段 + 模块常量，**不取自声明文档自身**；有测试锁死这三条 |
| **G4 收敛假声明** | `network.none@1` 的声明与实现一致（§2.E 二选一，附观测依据）；`_CAPS` 若保留，必须写清它是"跨模板并集"还是"逐模板"，并让声明按**模板/执行**构造 |
| **G5 单一词汇** | 语义三元组（`isolation.wrap@1` / `process.spawn.typed@1` / `terminal.run@1`）与具体能力（`filesystem.*` / `network.*`）的**关系写成代码 + 测试**；有守卫测试防止再出现随意拼的能力 ID 字符串（47 在此之上扩展） |
| **G6 不退化** | 根套件（基线 **605 passed / 3 skipped**，2026-09-16 实跑）+ 插件套件 + 四家全链门（用 49 修好的**显式** bundle 口径）+ Linux 侧既有门不退化 |

## §1 移植清单（来源：`feature/capability-entry-v1`，基线 `897a833`，HEAD `1c74d15`）

**A 库（新，整包）**：`src/agent_box/extensions/capability/` 七个模块——
`__init__.py`、`ids.py`、`requirements.py`、`match.py`、`selection.py`、`documents.py`、`errors.py`。

**B 沙箱侧**：`plugins/agent-box-sandbox-bwrap/src/agent_box_sandbox_bwrap/declarations.py`（+245）
与其测试 `plugins/agent-box-sandbox-bwrap/tests/test_declarations.py`。

**C 测试**：`tests/capability/**` 八组（authorization / documents / errors / fake_refusals /
ids / match / requirements / selection，约 1725 行）+ `tests/server/test_capability_gate.py`（258 行）；
`tests/server/test_harness_sidecar.py`（+179）与 `tests/server/test_server_capability_contract.py`（+13）
**按意图合并**（这两个是共享文件，不许整段覆盖）。

**D Server 接线（+195 行，三个文件）**：
`bootstrap/runtime.py`（`_capability_binding`、`_capability_material`、
`_APPROVED_CAPABILITY_DECLARERS`、把 documents/grants/authorized/binding 注入端口）、
`execution/sidecar.py`（端口构造参数）、`execution/sidecar_backend.py`（门口的 fail-closed 校验）。
**注意**：这三个文件到 50 开工时已被 44–48 改过，必须**逐段重放到当前签名**，不得整段粘贴。

**E 收敛项（本单必须做掉）**：`network.none@1` 在我们的**产品路径**上是空头声明——
第一手复核：`provider.py:56` 的 `--unshare-net` 属于**非 sidecar** 编译器，sidecar 房间的 argv
**不产出**该标志（`compose_sidecar_room` 也没有网络参数），而 `_CAPS`（`provider.py:25`）对**整个
provider** 同时声明 `network.none@1` 与 `network.inherit@1` supported。二选一，**必须有观测依据**：

1. **推荐（风险最低，与 CAP-01 做法一致）**：按模板/执行构造声明，sidecar/远端模板把
   `network.none@1` 声明为 **unavailable**（用"argv 缺失"作证据锚点），`inherit` 为 supported；
   "给房间补网络姿态"留给 **47** 的中立计划（那里 `MountPlan` 才有 network 声明位）。
2. 备选：给 sidecar 编译器补 `--unshare-net`（真加一层隔离），但那要求房间先有网络参数——
   属于 47 的范围，本单不做；若选它，必须先把房间的网络参数做出来再改声明。

## §2 硬性规则

- **不合并那条分支**：不 `git merge`、不 cherry-pick 它的提交、不并它的 `dispatch/agentbox-system/`
  调度快照与 `docs/capability-entry-v1/**` 语料进历史（那些只作**只读设计输入**，报告里引用路径与提交即可）。
- **来源可审计**：每个移植文件在提交信息或文档里注明"来源 `feature/capability-entry-v1` @ `1c74d15`"，
  移植后的改动逐条记录（签名适配 / 冲突重放 / 收敛项）。
- 零真实模型调用；不碰 wire（28 方法、`wire/1`、事件 schema）；前端仓只读。
- 能力**不许自报**；本单引入的批准映射与授权推导必须 fail-closed。
- 不 reset/stash/clean、不 merge main、不 push。

## §3 阶段

- **A** 移植库（`extensions/capability/**`）+ 定向测试跑绿；
- **B** 移植 `declarations.py` + 其测试；处理与现有 `_CAPS`、`SandboxRequirements`、
  `harness_capabilities.py` 的关系（写清、别留两套）；
- **C** 逐段重放 Server 侧 195 行到当前签名 + `tests/server/test_capability_gate.py` +
  两个共享测试文件的按意图合并；
- **D** 收敛 `network.none@1`（§1.E），补观测证据；
- **E** 回归（G6）+ 收口报告（含来源清单与关系说明）。

## §4 六件套 DoD

1. 实现（提交，注明来源）；2. 定向测试 + 反例（伪造 provider 声明必须被拒、未批准 provider 必须被拒、
   `network.none@1` 的新声明与实现一致）；3. 迁移等价证据（测试计数对照移植前后）；4. 回归计数
   （根套件 + 插件套件 + 四家全链门，带范围/命令/HEAD）；5. status 分账；6. 清理证据
   （Git 状态、`git diff --check`、来源清单）。

## §5 阻塞账格式

与 46 §7 相同。

## §6 报告格式

```text
结果：CAPABILITY_LAYER_ABSORBED 或 CAPABILITY_LAYER_PARTIAL
来源：分支 @ 提交；逐文件移植清单（新增/重放/按意图合并）
等价性：移植测试计数（新增 N 条）与既有测试计数对照；任何断言改动逐条理由
接线：装配边界注入点的当前签名位置；反例结果（伪造 provider / 未批准 provider）
收敛：network.none@1 的选择与观测证据（argv 缺失锚点 或 新增 --unshare-net 的证据）
关系说明：语义三元组 ↔ 具体能力的对应（代码位置 + 测试）；harness_capabilities 是否重叠及处理
回归：根套件 / 插件套件 / 四家全链门计数与退出码
未做项与阻塞项：逐条
```

## §7 边界

- **不做** 47 的中立计划与房间网络参数（本单只把声明与其一致起来）；
- **不做** CAP-02…CAP-05 的队列内容（那是那条分支自己的调度，本单不娶）；
- **不回合并父分支**（之后单独一步）。
