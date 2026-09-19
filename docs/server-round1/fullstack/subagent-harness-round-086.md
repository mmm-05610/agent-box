# 086 — 65 最后一圈：真 harness 父侧自发起 tools/call（证据）

> §0–§8 = **阶段 1**（选家与工具播发）。阶段 2 的一轮在
> `tests/server/test_subagent_harness_real_round_086.py`（含其 docstring 里的两处有意偏差）与本树账行。
> §9–§11 = **阶段 3**（四项核对、由此实测出的两条死规则与其修法、账务）。

基线 `4c32992`。本阶段做了三件事：**一手钉死 claude CLI 到底从哪个文件读 MCP 服务器**、
**在生产形态下验证合成桥条目能否真的落到那个文件**、**按注册表把不能承载桥的家列出来**。

结论先说：65 把桥渲染进 claude 的 `mcp_target`，而该家**根本不读那个文件**；
生产模板又把同一个文件声明为**只读投影**，于是"授予子代理的父 Profile 在真部署形态下压根组装不出来"。
两者都是本阶段实测出来的，不是推断。

## 0 被观测的是哪个二进制

| 项 | 值 | 定位方式 |
| --- | --- | --- |
| claude CLI | **2.1.274 (Claude Code)** | `shutil.which("claude")` → 宿主安装；每个用例都跑了一次 `claude --version` 并写进 `subagent-harness-round-086-pin.json` 的 `claudeVersion` |
| node | v22.23.2 | `shutil.which("node")` |
| 本部署钉死版本 | claude CLI **2.1.270** / 适配器 **0.77.0**（085 §0 的表） | 仓内工件 |

**版本漂移是一条如实记下的限制**：085 §0 明确警告"用系统安装当依据会把本部署接受的键判成未知键"，
本阶段的读路径观测因此是**宿主 2.1.274 上的一手事实、对钉死 2.1.270 尚未一手确认（未验证）**。
不允许绕过：仓内工件二进制**不得手跑**（本轮尝试被拒），只能在阶段 2 经 Server 自己的启动路径
（真 Worker + bwrap + 真运行时工件）里由**沙箱内的钉死 CLI** 给出最终确认——那正是阶段 2 要跑的东西。

## 1 实测：MCP 服务器的读路径（三次真 CLI 运行 + 一次空白对照）

探针**不是**桥，而是一个静态 stdio MCP 服务器（`tests/server/fixtures/mcp-config-probe-server.mjs`）：
它只回答 `initialize` / `tools/list`，工具名固定 `probe_tool_086`。这把唯一要问的问题
——"客户端到底读了哪个文件"——和 65 已经证明的东西（桥会说 MCP、会委派）分离开。

读法也只用一手证据：答案从 **CLI 自己发给模型的那次请求体** 里读出来（`tools` 数组）。
端点是 loopback 假 Anthropic Messages（SSE 固定文本回答，**零真实模型调用**），
`HOME` 与 `CLAUDE_CONFIG_DIR` 都指向临时目录（开发者的真实配置既不参与也不被写）。

| 声明位置（一次只写一个） | `tools` 里出现 `mcp__agentbox-probe__probe_tool_086` | 该次运行的模型请求数 |
| --- | --- | --- |
| `$CLAUDE_CONFIG_DIR/settings.json` ← **正是 65 的渲染目标** | **否** | 1 |
| `$CLAUDE_CONFIG_DIR/.claude.json` | **是** | 1 |
| `<项目根>/.mcp.json` | **是** | 1 |
| 空白对照（三个文件都不写） | 否 | 1 |

⇒ 因果成立：条目出现与否**只由那三个文件里写了哪个决定**；空白对照排除了"环境/端点/CLI 自带工具"这三种解释。
⇒ 出现的是全名 `mcp__<服务器名>__<工具名>`：客户端不只读了文件，还连上去调了 `tools/list`。
⇒ **65 渲染进 `settings.json` 的条目落进了一个没人读的文件**；同一文件里的用户自建 MCP 服务器（58 的资产中枢）同理。

原始逐笔事实：[`subagent-harness-round-086-pin.json`](subagent-harness-round-086-pin.json)
（sha256 `0d2aad5e30a936cf5bd6801c58c2f45fd9fa8d9b4dd85402a0feebb0033de95f`）。
复跑命令（本轮所有门都要这条 PYTHONPATH，见本树 status 的环境节）：

```bash
export PYTHONPATH=src:plugins/agent-box-harnesses/src:plugins/agent-box-runtime-wsl/src:plugins/agent-box-runtime-local/src:plugins/agent-box-sandbox-bwrap/src:plugins/agent-box-skills/src:plugins/agent-box-terminal-session/src
AGENTBOX_086_PIN_REPORT=/tmp/086-pin.json python3 -m pytest -q tests/server -k mcp_config_source
```

同一文件里的断言已按实测收紧为**发散即失败**：`settings.json ⇒ 缺席`、`.claude.json ⇒ 出现`、
`.mcp.json ⇒ 出现`、空白对照 ⇒ 断言空；再加一条不用 CLI 的注册表守卫
`test_the_registry_slot_for_claude_code_is_a_file_the_cli_reads`（槽位必须等于被测出的路径、
必须落在 `CONFIG_HOME` 下、且**不得**是只读投影目标）。

58 当年把 `mcpServers` 钉在 `settings.json`，依据是**文件出现频次**（该文件里 `mcpServers` 有 100 处引用）。
频次是"别人这么写"的事实，不是"CLI 会读"的事实——本阶段补的就是后者。

## 2 改了什么：注册表里 claude-code 的 `mcp_target`

```
mcp_target = "/runtime/home/.claude/settings.json"   →   "/runtime/home/.claude/.claude.json"
```

落点在 `plugins/agent-box-harnesses/src/agent_box_harnesses/harnesses.toml`，**不在 Server**：
`runtime.py:_registry_profile_spec` 的原则就是"资产槽位是这个家自己的事实，由这个家随注册表投递，
绝不写死在 Server 里"，所以修正也只回到注册表。Server 侧一行未改。

为什么选 `.claude.json` 而不是项目级 `.mcp.json`：
`.mcp.json` 虽然实测有效，但它要写进**用户的真实工作区**（工作区是挂载进来的用户目录，
Server 从不往里写配置）；`$CLAUDE_CONFIG_DIR` 由生产模板钉成 `/runtime/home/.claude`，
所以 `.claude.json` 落在**执行期本地覆盖层**（`overlay_policy = "execution-local"`）里，
与只读投影 `settings.json` 是兄弟、与状态投影 `projects/` 也不同路径。

`mcp_key` 仍是 `mcpServers`（实测就是它）。`hooks_target` **不动**：hooks 是 59 另外钉的，
本阶段没有对 hooks 的读路径做一手观测，不做无证据的连带修改（见 §5 的第二条）。

## 3 实测：生产形态下的组装（65 之前只在无投影的夹具形态下验过）

`tests/server/test_subagent_harness_round_086.py` 直接取 `production.harness_deployment()`
的产物（含 `projectionFiles`、`homeConcurrency`、`usageProbe`、`credentialEnvironment`），
只把适配器换成评审过的夹具 peer、把工件挂载清空（本轮不需要真工件），
然后按 wire/1 真跑一轮。

| 用例 | 修改前（一手） | 修改后（一手） |
| --- | --- | --- |
| 授予子代理的父 Profile | `ASSET_SLOT_CONFLICT: a read-only projection already covers the declared target /runtime/home/.claude/settings.json`（`runtime.py:1020`，包成 `DispatchAmbiguous`） | 轮次 `completed`，`.claude.json` 里有 `agentbox-subagents` 条目 + 一次性令牌 |
| 无出向授予的 Profile（反例） | —— | 角色目录里**没有** `.claude.json`：条目由授予引起，不是每家每轮都发 |
| 只读投影 | —— | `settings.json` 存在且**不含** `agentbox-subagents`（本运行形态下它是占位空文件，Server 从不写它） |

**这是一条真 bug，不是测试没写好**：65 的端到端用例（`test_delegation.py:506`）用的部署
`projectionFiles` 为空、且父侧由测试进程自己写 JSON-RPC 驱动桥——"零授予⇒无条目、有授予⇒有条目"
只在夹具形态成立。真实 claude 部署上，65 的机制在**组装阶段**就失败。

## 4 家与排除（按注册表派生，不按感觉）

工单写"选最省的一家，例如 pi"。实测：

| 家 | 声明 `mcp_target` | 本阶段的判定 |
| --- | --- | --- |
| `claude-code` | `/runtime/home/.claude/.claude.json`（本阶段修正后） | **选它**：槽位已一手钉死、生产模板齐备、评审过的真家链门存在 |
| `codex` | `/runtime/home/.codex/config.toml` | 结构上能承载，但**与自家只读投影相撞**（§5），本轮不改 |
| `qwen` | `/runtime/home/.qwen/settings.json` | 该家 CLI **本宿主未安装** ⇒ 读路径无法一手钉死（不做无观测的修改） |
| `pi`、`dsh`、`hermes`、`kilo`、`opencode` | 无 | **不能承载桥**：`SUBAGENT_BRIDGE_TARGET_UNSUPPORTED`（注册表派生，非猜测） |

排除理由按工单口径写全：五家的工具面**结构上不存在**（没声明 MCP 文档），不是"播发了但我们没接上"。
⇒ **工单的建议前提（"最省的一家例如 pi"）不成立**，这是阶段 1 的前提修正。

## 5 交回调度者的两条（本单不改契约、不越界）

1. **`codex` 的槽位冲突**：`config.toml` 既是 codex 生产模板的只读投影、又是它声明的 `mcp_target`，
   所以"授予子代理的 codex 父 Profile"仍然在组装期 `ASSET_SLOT_CONFLICT`。修法要么是把投影拆成
   "只读基座 + 可写增量"，要么给该家另找原生可读且未被投影的路径——两者都不是本单范围，
   本单只把它写成断言（`test_codex_still_collides_and_is_excluded_from_this_round`）而不是留成静默。
2. **`hooks_target` 同一形状**（**推导**，非实测）：claude 的 `hooks_target` 仍是
   `/runtime/home/.claude/settings.json`，即同一个只读投影目标。走的是 `runtime.py:1018` 同一道检查，
   因此"给 claude-code 启用任一 hook"应当同样撞 `ASSET_SLOT_CONFLICT`。本轮**未**为其做一手观测，
   故不改、只登记；要改得先像 §1 那样钉 hooks 的读路径。

## 6 偏差登记

- 工单 DoD 第 1 条写"**实现：无（补一圈）**"。实际本阶段改了 **1 行注册表事实**
  （`harnesses.toml` 的 `mcp_target`）+ 1 处**另一单**的断言值（`tests/server/test_asset_hubs.py:184`，
  58 的槽位钉值，随事实一起改并标了依据）。Server/Core 一行未动。
  登记为**偏差**：这一圈不是"补跑一遍就绿"，而是跑出了"上一圈的落点没人读"这个真缺陷。
- 工单 §Scope 的"三家都不可行 ⇒ PARTIAL"里"三家"按注册表实测只有两家有 MCP 文档
  （claude-code/codex），第三家 qwen 的 CLI 不在本宿主。

## 7 阶段 2 要跑的东西（本阶段末的设计事实，已核实的前置）

- 入口只能在 `tests/**`：`scripts/**` 不在本单 `write_paths` 内，评审过的
  `claude-production-chain-gate.py` **一个字都不能改**；阶段 2 以 `importlib` 按路径**复用**它的
  部件（`build_artifact` / `verify_artifact` / `compile_guard` / `DirectWorkerConnector` /
  `wire_post` / `wait_for_turn` / `summarize_turn` / `profile_version` / `cleanup_check`），
  委派这一段（两个 Profile + 一条授予 + 会发 `tool_use` 的假端点）写在测试里。
- 桥要拨回来的地址是 `self_url_of()` = `http://127.0.0.1:$AGENT_BOX_HTTP_PORT`，
  所以 Server 必须**真监听** loopback 端口（评审过的 `uvicorn.Server` + 线程模式在
  `test_delegation.py:596` 已是本仓既有写法）；`TestClient` 不算。
- 出口守护只放 loopback（`deploy/claude/egress-guard.c`：非 127.0.0.1/::1 在解析前失败并落审计），
  所以桥拨回 Server 在守护下是**允许**的，且审计里出现 `denied` 就说明这次运行不干净。
- 假端点按"**请求里有没有 `run_subagent`**"分支回答：父轮（有授予⇒有桥⇒有该工具）收到
  `tool_use`，子轮（无出向授予⇒无桥）收到文本。这样"发起 `tools/call` 的是真 CLI"可判定、可反证。

## 8 一条**基线既有**失败（不是本单回归，本单不修）

跑 `plugins/agent-box-harnesses/tests` 时看到：

```
plugins/agent-box-harnesses/tests/test_skill_projection.py::test_all_five_registry_targets_are_lossless_and_read_only FAILED
>               assert source.guest_target == "/runtime/home/skills/review"
E               AssertionError: assert '/runtime/hom...skills/review' == '/runtime/home/skills/review'
```

**判定 = 基线既有**，一手复现而非推断：把基线提交**逐字节取出**后原地复跑（工作树未动）：

```bash
rm -rf /tmp/086-baseline && mkdir -p /tmp/086-baseline
git archive 4c32992 | tar -x -C /tmp/086-baseline
cd /tmp/086-baseline && <本树 PYTHONPATH> python3 -m pytest -q \
    plugins/agent-box-harnesses/tests/test_skill_projection.py     # → 1 failed（同一断言、同一两个字符串）
```

根因与本单无关：该用例把**一家**的技能槽路径写死成 `/runtime/home/skills/{skill_id}`，
而注册表（**基线就如此**，`git diff` 只动了 `mcp_target` 一行）里 claude 是
`/runtime/home/.claude/skills/{skill_id}`、qwen 是 `/runtime/home/.qwen/skills/{skill_id}`。
⇒ 52/58 把 `skill_target` 改成逐家事实之后，这条"五家同一路径"的断言就陈旧了，一直没被跑到
（根套件 `testpaths = tests`，不含 `plugins/**/tests`）。

本单**不顺手修**：它属于技能投影（52/58 那一族事实），改它会把无关修正混进阶段 1 的提交，
且"钉死正确的逐家期望"需要一次技能读路径的一手观测——那是另一张单的形状。**登记为交回项**（见账行）。

## 9 阶段 3：四项核对＝去跑，不是签字

工单写的第 3 阶段是"归属/摘要/审批/取消四项核对"。65 的四个模块 docstring 把这四条**都说了**，
`tests/server/` 里每条也**都有单元测试**——所以"核对"若只是读一遍代码签字，四条全过。
本阶段把"核对"读成它唯一有意义的样子：**从产品真用的入口把这条规则跑一遍**。载体是
`tests/server/test_subagent_rule_liveness_086.py`（8 条），每条在断言里自带反例。

| 项 | 驱动它的入口 | 第一次跑（`3d19218`）| 现在 | 反例就写在断言里 |
| --- | --- | --- | --- | --- |
| 归属 | `DelegationService.run` → 真子轮 + 父轮自己 `complete_turn` | ✅ | ✅ | 父轮自己记成 3/2/5：任何"把子轮抄到父轮"的汇总会读成 14/9/23 |
| 摘要 | 同上，两端都跑 | ✅ | ✅ | 超长侧 `4096 + "…"`，短侧逐字 `summary of <turnId>`——只测一侧都不算 |
| 取消（REST）| `SessionService.cancel_turn` | ❌ 红 | ✅ | 子轮 `running`；断言要求它变 `cancelled` 且**经过 execution 端口**（`stalled.cancelled`）|
| 取消（wire）| `WireService.runs_stop` | 未测 | ✅ | 桌面发的是这一条；只接一个门就是 103 说的形状 |
| 审批镜像 | 真方法 `SidecarExecutionBackend._native_event` | ✅ | ✅ | 子轮的 `approval.requested` 必须落在**父轮**上并带 `from_subagent.turnId` |
| 环 | 三边真链 A→B→C→A，逐跳真子轮 | ❌ `DID NOT RAISE` | ✅ | 第三跳放行 ⇒ 不抛；且断言被拒的那一跳**不建轮** |
| 深度 | 四角色三跳全不同 | ✅（当时 `chain` 从不传，上限形同不存在）| ✅ | 反例＝被 R-0016 撤销的那道上限本身：加回去这轮就红 |
| 端点形状 | 正则读 `app.py` 里 `service.run(...)` 实参 | ✅ | ✅ | 出现 `chain` 即红：血统由调用方自报的写法不算接上 |

**四条里两条是死的**，两条死法不同：

* **取消**——`cancel_children` 在 `src/agent_box` 里**零调用方**（`grep` 一手核），
  两个取消入口都只按 `turn_id` 停自己；父轮 `cancelled` 之后子轮继续跑，账本与真进程各说一套。
* **环**——授权层只拒**直接反向边**（`profiles/repository.py:140/:157`），
  于是 A→B、B→C、C→A 三条边**都能建**（委派图不是 DAG）；而运行期那道 `check_depth`
  依赖调用方传进来的 `chain`，**loopback 端点从不传**，所以它对真血统永远看不见。
  阶段 3a 的第一版假设（"两跳环能建"）也被实测否掉：两跳在授权层就被拒了——**登记的修法因此不是"再加一层限制"**
  （R-0016 明令不许新增限制），而是**把已有的环检查接到真链路上**。

一条顺带实测到的次序事实（本单不改）：`validate_run_arguments` 跑在环检**之前**，
所以一个既非法又闭环的调用会先吃到 `SUBAGENT_ARGUMENT_INVALID`（第一版就是被 "round two" 只有两字撞开的）。

## 10 修法与其门

| 改动 | 位置 |
| --- | --- |
| 祖先链由账本走：`turn_ancestry_profile_ids`（沿 `parent_turn_id` 上溯，oldest→newest）| `sessions/repository.py` |
| 谁是谁的子：`live_child_turn_ids`（活跃态集合读 `ACTIVE_TURN_STATES`，同一处事实）| `sessions/repository.py` |
| `check_depth` → `check_cycle`；删 `DEFAULT_DEPTH_LIMIT`（R-0016）| `profiles/subagents.py` |
| `run` **不再有 `chain` 参数**；环检读上面那条链；删 `cancel_children` | `execution/delegation.py` |
| `cancel_descendants`（递归、父先子后），接进 `cancel_turn` | `sessions/service.py` |
| 同一个 `cancel_descendants`，接进 `runs_stop` | `wire/handlers.py` |

递归的终止条件是账本给的结构事实：一个轮的父轮一定比它早存在，不会有回边。
两个入口都在父轮**仍活跃**时下发级联（`runs_stop` 那侧即便本进程 stop 未被确认也照发），
理由与 `record_cancel_request` 一致：**没确认停下不等于不该让它停**，而"未确认"绝不写成"已停"。

门怎么证伪（两条都测过，不是推的）：

1. **同文件在同一提交上的前后**——`3d19218`（修法之前）`3 failed, 4 passed`；
   本阶段（修法之后）`8 passed`。
2. **进程内抽掉两条规则**——`delegation.check_cycle = lambda: None` ＋
   `SessionService.cancel_descendants = lambda …: []`，同一份 8 条测试重跑 ⇒
   **恰这 3 条红**（REST 取消、wire 取消、环），其余 5 条照绿。
   这条测量在**一次性进程内**做，未改任何产物文件（改文件被权限层挡下，也不该改）。

`tests/server/test_delegation.py` 与 `test_subagents.py` 的两处旧断言按新机制改写：
`cancel_children(records, …)` ⇒ `records.live_child_turn_ids(…)`（断的是同一件事实，换了拥有它的层），
`SUBAGENT_DEPTH_EXCEEDED` 那条 ⇒ 换成"调用方不再自报血统"＋每轮 4 次上限仍在。

## 11 账务、清理与本单没做的事

* **回归计数（本阶段末，一手）**：`tests/server/test_subagent_rule_liveness_086.py` **8 passed / 3.97 s**；
  委派面三份（liveness + `test_delegation` + `test_subagents`）**22 passed**；
  **根套件 954 passed / 0 failed / 0 error（382.19 s）**。这个数**能逐项对上**：099 收口时 946
  ＋ 本单阶段 3 新增的 8 条（3a 的 7 条 ＋ 3b 的 wire 入口 1 条）= 954 ⇒ **零退化**。
  （阶段 1 当时报的 941 已作废：它没计入阶段 2 那条真实链路用例，口径见账本 086 计数注记。）
  同一跑里 `tests/server -k subagent` 为 **17 passed / 637 deselected、0 skipped** ⇒
  **G1 的那条真实链路用例（真 CLI 进程 + bwrap + 真桥往返）在本次复跑中再次通过**，是**可复跑**的门证据，不是一次性观测。
  再按名单独跑一遍钉死它没被跳过：`pytest -q tests/server/test_subagent_harness_real_round_086.py -rsv` ⇒
  **1 passed in 18.72 s**（无 skip 报告）。
* **真实模型请求：本阶段 0 笔**（全为 loopback 夹具）。阶段 2 亦 **0 笔**——那一轮的端点是
  脚本化的 loopback（其 docstring 逐条写明结构应答规则），真的是 **CLI 进程、bwrap 与 MCP 往返**。
  与 R-0017（假端点优先、真实调用只用在门上）一致。
* 凭据 locator **未触碰**；无外呼；无落盘凭据内容；无临时数据根残留（夹具全在 `tmp_path`）。
* **G2 字面与实现不一致（交回，不自行改契约）**：工单 G2 写"子轮用量**记在父轮**"，
  实现与 65 的 docstring 是"子轮用量留在子轮行，`parent_turn_id` 是那条链，父轮在**工具结果里**
  拿到子轮的用量事实"——**没有任何东西抄到父轮**。本阶段按实测口径登记（归属 ✅）并把这句契约字面交回调度者。
* **未做（本单不做）**：三边环在**授权层**的完整拒环（要改图可达性，属 65 的授权面，非本单）；
  Worker 对 `session/request_permission` 的应答路径（阶段 2 因此必须预批两个桥工具）；
  父轮 120 s 进程上限 vs 子轮 600 s 等待的张力；把 `cancel_descendants` 之外
  的"一个父轮多子轮并发"真机化（夹具下已测一个子轮的级联）。
