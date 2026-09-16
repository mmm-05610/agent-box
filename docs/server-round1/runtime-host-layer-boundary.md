# Host 层边界（心智模型 + 现状 + 改造方向）

日期：2026-09-16。定位：**设计备忘**，不是已完成阶段的证据；不提高任何 READY 计数。
依据：本仓库代码第一手阅读（含行号），以及 `docs/implementation/server-architecture-v1.md`、
`docs/architecture/ARCHITECTURE.md`、`docs/server-round1/fullstack/profile-home-isolation.md`。

## 1. 心智模型（五样东西）

```
      你家（Windows）                                干活的地方（WSL / 远程机器）
 ┌────────────────────┐                        ┌────────────────────────────────┐
 │  ① 记事本           │   ② 把行李送过去        │  ③ 一间房间                     │
 │   - 角色设置         │ ──────────────────────►│     - 只挂你指定的文件（能读/能写各自标好）
 │   - 每轮对话记录     │                        │     - 其余的一律看不见
 │   - 钥匙保险柜       │   ⑤ 把笔记本收回来      │  ④ 里面有个工位                 │
 │                     │ ◄──────────────────────│     - 一个叫 Pi 的工程师在这干活  │
 └────────────────────┘                        └────────────────────────────────┘
```

| 名字 | 系统里是什么 | 一句话 |
| --- | --- | --- |
| 记事本 | 权威（Windows Server） | 角色设置、对话历史、钥匙，只有这一份算数 |
| 工程师 | harness（插件） | Pi / Claude / Codex，各说各的方言 |
| 房间 | 沙箱 | 进程出生时被施加的规矩：看得见什么、能写哪儿、能不能上网 |
| 工位 | 终端会话 | 进程跑在哪里、人怎么接进去（tmux 可 attach；stdio 只能顺流看） |
| 搬运/地址 | Host 层 | 在哪台机器干活、东西怎么过去、进程怎么起停 |

**唯一需要守的规则**：上层准备的东西里**不许写死"这台机器"的信息**（宿主路径、实现名如
`bwrap`/`tmux`），只说"要干什么"和"房间里的位置"。这样换机器时，只有 Host 那一层换实现。

**Host 层的职责就五件事**：连上、传东西过去、起进程、停进程、看输出。所谓"落位/能力声明"
不是新的职责——前者是"传完之后自然知道地址"，后者是"这条通道的自我介绍"。

## 2. 三层契约（已存在的正式定义）

`src/agent_box/extensions/runtime_composition/protocol.py:19-21`：

```python
RUNTIME_HOST_CONTRACT_ID     = "agent-box.runtime-host@1"
SANDBOX_CONTRACT_ID          = "agent-box.sandbox@1"
TERMINAL_SESSION_CONTRACT_ID = "agent-box.terminal-session@1"
```

- 三个端口协议在 `protocol.py:471/479/486`：`RuntimeHost.stage()`、`Sandbox.wrap()`、
  `TerminalSession.allocate()/run()`；
- 组合与流水线在 `coordinator.py:71-130`（预检 → 出束 → 送货 → 包壳 → 分配 → 落账 → 执行 →
  句柄），`present()` 132、`cleanup()` 143；`RuntimeBinding` 三个 ref 全必填
  （`protocol.py:233`，缺一 → `CompositionRejected(INVALID_BINDING)`）；
- 契约声明："public DTOs never carry shell text, host paths, secrets, or provider-specific
  configuration"（`protocol.py` 模块 docstring）。

## 3. 现状（第一手，含证据）

### 3.1 契约齐全，但**产品路径没有走它**

- `RuntimeCompositionCoordinator` / `RuntimeBinding` 在 `src/` 与 `plugins/` 里**只有导出与
  自身定义，没有任何产品调用者**（grep 非测试命中：`extensions/__init__.py:70/71/152/153`、
  `runtime_composition/__init__.py:4`、coordinator 自身）。也就是说：预检、账本、幂等、由内向外
  补偿这一整套，**在产品里没有生效**。
- Server 侧也没有加载 `agent_box.plugins` 入口点（loader 在 `extensions/loader.py:20`，但
  `src/agent_box/server/` 内无调用）。因此 `runtime-local` / `sandbox_bwrap` /
  `terminal_session` 三个插件的 `create_plugin` 入口**不在产品链路里**。

### 3.2 产品真实链路（三层被揉进一个模块）

```
agent_box.server.__main__:28
  → bootstrap/runtime.py:316 build_runtime_from_sidecar_deployment
  → bootstrap/runtime.py:592 SidecarExecutionBackend
  → execution/sidecar.py  （Server 侧：拼 view、放 secret、**亲手拼 bwrap 命令行**）
       ├─ view.prepare / view.put(32KB 分块) / view.commit  → 真实路径
       ├─ secret.put                                       → 受限文件路径
       ├─ compile_remote_sidecar_bwrap_argv(...)            ←  ←  ←（sidecar.py:396）
       └─ spawn {argv, interactive:true}
  → wsl.exe → workers/agent-box-worker（Rust）：spawn.interactive@2
  → sidecar bundle（agentbox-sidecar/runtime/worker-entry.mjs）→ 原生 harness
```

- **Host 侧实现**：`plugins/agent-box-runtime-wsl`——但它**不是插件**（`pyproject.toml` 无
  `agent_box.plugins` 入口点，自述为 "Bounded WSL Worker connector"），并且依赖
  `agent-box-sandbox-bwrap`。它现在同时干着：通道（wsl.exe + 帧）、搬运（view/secret）、
  **房间编译（bwrap argv）**、起进程（spawn）。
- **沙箱侧**：`plugins/agent-box-sandbox-bwrap` 提供能力表（`provider.py:25` 十个能力）与
  `compile_remote_sidecar_bwrap_argv`；被 Host 侧直接 import 调用——**房间的活由通道代劳**。
- **工位侧**：`plugins/agent-box-terminal-session`（tmux / direct-stdio）**在产品路径里完全没接**
  （`execution/sidecar.py` 与 `runtime-wsl` 内 grep 无命中）；今天的工位实际是 Worker 的
  `spawn.interactive@2` + stdio 帧（无 PTY、无 attach）。
- **harness 侧**：`plugins/agent-box-harnesses/.../pi/provider.py:27` `PiExecutionProvider`
  声明 `input_limits` 需要 `runtime-host@1`/`sandbox@1`/`terminal-session@1` 各一个——但这条
  声明同样不在产品链路上生效（产品走 sidecar 部署，不走 Core 的 ExecutionProvider 组合）。

### 3.3 结论

**三层"已定义、有实现、有测试，但未被产品路径采用"**；产品路径把通道、搬运、房间、工位
揉进了 `execution/sidecar.py`（Server 侧）与 `agent-box-runtime-wsl`（连接库）两处。
这正是"层级怎么都捋不清"的客观原因：**代码里同时存在两套结构**。

## 4. 应改成什么才干净（三条，不动已验证的部分）

1. **把"房间的活"搬回沙箱层**：`sidecar.py` 里 import 并调用
   `compile_remote_sidecar_bwrap_argv`、拼 guest 环境（`HOME/XDG_*/PATH`）、判断哪些挂载可写
   这三段代码，移入 `agent-box-sandbox-bwrap`，由它产出"隔离规格"（argv + spec 摘要 +
   spawn 令牌）。Server 只拿规格，不拼 argv。
2. **把"通道"收敛成纯通道**：`agent-box-runtime-wsl` 只保留：连上、传字节、按给定 argv 起进程、
   停、取回、回收。**不再 import 沙箱插件、不再知道 bwrap、不再决定挂载语义**。
3. **声明去宿主化**：部署文档里的 `pluginRoot` / `source` 改成具名来源 + 摘要；工件挂载改成
   "令牌 + 摘要 + 房间内目标"。真实路径只在 Host 层内部出现。

可选第 4 条：要么把 terminal 层接进来（获得 attach），要么在产品里**明确声明"本路径只提供
stdio 流、不提供 attach"**——今天的状况是既没接也没声明。

## 5. 验收（三条门，可检验）

1. **禁字门**：上层的装配代码与部署声明里不出现宿主路径、`bwrap`/`tmux` 等实现词。
2. **替换门**：把 Host 从 WSL 换成本机（`runtime-local`），除 Host 实现外零改动跑通同一条
   假端点全链门。
3. **契约测试三跑**：同一组"送入 → 启动 → 停止 → 回收"动作在 local / wsl /（将来）ssh
   三个实现上行为一致，差异只允许是"能力不足的拒绝"。

## 6. 术语对照（讨论时避免混用）

| 讨论用语 | 代码里的东西 |
| --- | --- |
| 场地 / Host | `agent-box.runtime-host@1`；今天的实现是 `plugins/agent-box-runtime-wsl`（非插件） |
| 房间 / 沙箱 | `agent-box.sandbox@1`；实现 `plugins/agent-box-sandbox-bwrap` |
| 工位 / 终端 | `agent-box.terminal-session@1`；实现 `plugins/agent-box-terminal-session`（未接） |
| 工单 / 束 | `RuntimeBundle` / `IsolatedProcessSpec`（`runtime_composition/protocol.py`） |
| 探视证 | `AttachDescriptor`（同上，未被产品使用） |
| 记账 | `coordinator` 的 ledger + `attempt_key`（未被产品使用） |
| 行李/笔记本 | 投影文件 + 原生状态（检查点对象）；今天由 `execution/sidecar.py` 搬运 |

## 7. 改造进度

### 第 A 步（房间的活搬回沙箱层）——**已实施并验证**（2026-09-16，提交 `0bc9bb8`）

- 新增 `plugins/agent-box-sandbox-bwrap/src/agent_box_sandbox_bwrap/sidecar_room.py`：
  `compose_sidecar_room(...)` 与 `guest_environment(...)`——guest home 布局、XDG 派生、
  "哪个挂载可写"、attempt-ephemeral 遮蔽，全部归沙箱层所有。
- `src/agent_box/server/execution/sidecar.py`：删掉 `import
  compile_remote_sidecar_bwrap_argv` 与自拼的 guest 环境/可写挂载/ephemeral 推导，
  并删掉本层重复声明的 `GUEST_HOME`（沙箱层才是它的出处）；现在只把刚拿到的
  token 绑定（view 路径、secret 路径、workspace）交给沙箱层，换回一份 `SidecarRoom`。
- **等价性有第一手证明**：用同一组 codex 参数分别跑"旧写法"与 `compose_sidecar_room`，
  argv 与环境**字节级一致**；新增测试
  `plugins/agent-box-sandbox-bwrap/tests/test_sidecar_room.py`（5 项）里有一条专门钉
  "换台机器只换绑定源"——同一份房间在另一处落位时，除绑定源外 argv 完全相同。

**验证（本轮实跑）**

| 项 | 结果 |
| --- | --- |
| 后端全量 `pytest tests` | **599 passed / 3 skipped** |
| sandbox 插件套件 | **117 passed**（含新增 5 项） |
| `pi-production-chain-gate.py` | exit 0，`PI_PRODUCTION_CHAIN_GATE_OK` |
| `hermes-production-chain-gate.py` | exit 0，`HERMES_PRODUCTION_CHAIN_GATE_OK` |
| `codex-production-chain-gate.py`（`--worker …bundle-c8`） | exit 0，`CODEX_PRODUCTION_CHAIN_GATE_OK` |
| `opencode-production-chain-gate.py`（`--worker …bundle-c8`） | exit 0，`OPENCODE_PRODUCTION_CHAIN_PREPARED` |

### 顺带发现：门脚本默认指向**过期的 worker bundle**

四个门脚本的 `WORKER_BUNDLE` 默认都是 `.acceptance-bundle-c4`，而文档记录的绿色基线是
**c8**（`sha256:514f48a9…`）。本轮用默认 c4 跑 Codex 门得到
`CODEX_GATE_STATE_SCAN_INCOMPLETE` / `VIEW_INVALID`（"view contains a symlink"，
codex 的 state 树里有自身产生的链接）；改用 c8 立刻 exit 0。

- 也就是说：**照默认跑门，复现不出文档里的绿色基线**——这是一条脚本卫生问题；
- 本轮**没有改这些默认值**（默认值属于证据配方，改动要单独记账），先在文档里记下；
- 建议：把四个门的默认 bundle 改成当前基线（或让缺参数时直接报错提示"请显式给 --worker"），
  并同步 status 里的口径。

### 第 A 步的残留（属于 B/C）

`src/agent_box/server/execution/sidecar.py` 仍然 `import` 沙箱插件（虽然只调用一次
`compose_sidecar_room`，不再知道 bwrap/guest 布局）。这条 import 就是第 B/D 步要替换掉的
接缝：由匹配层解析出的端口把它换成注入。

### 第 B 步（通道收窄 + 替换门）——**已实施并验证**（2026-09-16，提交 `d4255ac` + 本轮）

**B-1 通道收窄（`d4255ac`）**

- `plugins/agent-box-runtime-wsl/src/agent_box_runtime_wsl/execution.py`：删掉
  `import compile_remote_bwrap_argv`、删掉从 guest 路径推导凭据帧 id 的逻辑；
  `start()` 改为接收 `room_command(staged_home, secret) -> argv` 回调——先落位、
  再由沙箱层给命令、再跑。
- `plugins/agent-box-runtime-wsl/pyproject.toml`：**去掉对 `agent-box-sandbox-bwrap` 的依赖**
  （这一行曾经就是"通道依赖房间"的证据）。
- `src/agent_box/server/legacy_codex.py`：由它合成房间（`compose_codex_room`）并把命令交给通道。

**B-2 通道接口 + 本机实现 + 替换门（本轮）**

- `src/agent_box/server/execution/state_capture.py`（新）：把**状态收获规则**从通道里抽出来，
  成为与通道无关的一份实现（边界/受保护路径/ephemeral/凭据扫描/"两次快照一致"的 settle），
  外加 `merge_state_into_bundle`（标记 + 恢复状态并入 bundle 的规则）。WSL 通道改为调用它
  （构造期仍抛 `ValueError(code)`，运行期仍抛 `SidecarError(code)`，对外口径不变）。
- `src/agent_box/server/execution/local_channel.py`（新）：**同一份房间的本机实现**——落位到本地
  临时目录、放密钥（0600）、合成房间、直接执行那条 argv、stdio 接上、按同一套规则收获状态、
  退出时按进程组回收并清理。它**不是**隔离机制：隔离属于房间。
- `scripts/server-round1/host-substitution-gate.py`（新）：**替换门**。用同一份 Pi 部署、同一条
  命令、同一份房间，走**本机通道**（这台机器上直接跑 bwrap，全程没有 Worker）跑完整条链，
  并断言：native 会话建立、凭据到达假端点、流式输出带答案、`prompt` 报告 done、
  捕获的 journal **带着这一轮内容**、房间换一处落位**只差绑定源**、清理无残留。
  **结果：`HOST_SUBSTITUTION_GATE_OK`。**

**本轮验证汇总**

| 项 | 结果 |
| --- | --- |
| 替换门（本机通道，无 Worker） | **exit 0，`HOST_SUBSTITUTION_GATE_OK`** |
| Pi 假端点全链门（Worker 路径） | exit 0，`PI_PRODUCTION_CHAIN_GATE_OK`（两轮 completed、重开同 id、重开请求带旧轮） |
| 后端全量 | **599 passed / 3 skipped** |
| 通道插件 + 沙箱插件 | **154 passed** |

**结论**：host 现在是**可替换的实现**，不再是链路里的隐含前提——同一份上层意图在本机通道上
产生了同样的产品事实（同样的 native 会话、同样的流、同样的 journal、同样的清理）。第 C 步
（声明去宿主化）与第 D 步（把"匹配"接进产品链路）是剩下的两片。
