# LNX-003 · corrections.md — 针对 I 审阅限定的补证与更正

只读调查。开始/结束各核一次源 HEAD，四线 + 两仓 main **零漂移**（17:59 与 18:2x +08:00）。
本文件**不修改** LNX-001 任何原文件，只在此处补正；`control/reports/LNX-001/` 原文照旧保留。

## 1 后端 `main`：LNX-001 用"文件存在性"低估了独占规模 —— 更正为内容级计量

LNX-001 `disposition.md` §1.1 只说 #66/#67 与两线"非 patch 等价"、需要进一步调查。内容级实测：

| 指标（blob 级比较，非路径存在性） | 数值 | 复现口径 |
| --- | --- | --- |
| `main` 树内路径总数 | 962 | `git ls-tree -r main`（按 `mode type sha\tpath` 解析） |
| **两线都没有该路径** | 334（其中非 docs/skill **171**） | 逐路径比对 `main` vs `feature/env-provider-v1` ∪ `feature/env-provider-runtime` |
| 这 171 项里"分叉点已有、被两线删除"的 | **0** | 与分叉点 `80d2017` 三方比对 ⇒ **全部是 #66/#67 在分叉点之后新增**，不是两线删掉的残留 |
| **共有路径但 `main` 内容同时异于两线** | 128（非 docs/skill **122**） | `sha_main != sha_service AND sha_main != sha_runtime` |

171 项新增的分布：`plugins/agent-box-harnesses` 77、`src/agent_box` 30、`plugins/agent-box-studio` 25、
`plugins/agent-box-session` 16、`plugins/agent-box-acp` 12、`plugins/agent-box-workspace-local` 6、
`plugins/agent-box-web` 2、`tests/` 2、`tools/` 1。
122 项同路径内容分歧的分布（top）：`plugins/agent-box-harnesses` 42、`plugins/agent-box-web` 14、
`src/agent_box` 13、`tests/integration` 13、`plugins/agent-box-terminal-session` 7、
`plugins/agent-box-sandbox-bwrap` 6、`plugins/agent-box-git` 5、`plugins/agent-box-skills` 5、
`plugins/agent-box-artifacts` 4、`plugins/agent-box-runtime-local` 4；其中测试 16 个、schema/pyproject 11 个。

〔结论修正〕**纳入 #66/#67 不是"挑两笔提交"，而是引入一整套插件面**（`agent-box-acp`、`agent-box-session`、
`agent-box-studio` 三个包两线完全没有），并与两线在 122 个共有文件上三向分歧（含 `sandbox-bwrap` 6 个文件、
`runtime-local` 4 个文件——正是 Linux 相关的两包）。**方向性提醒**：`main:plugins/agent-box-harnesses/src/
agent_box_harnesses/session/acp.py:434-441` 与 `session/codec.py:48,64` 实现了 ACP `stop_reason` 的读法与
终态映射，而两线的 `plugins/**/src` 对该字段**零命中**（见 §3）—— 即 §3 的截断问题在 `main` 血统里另有一套已实现的解读器。
I 决定 5（不整支吸收、等针对性差异审阅）与本节不冲突，本调查维持"暂存"判定，只是把规模与风险面量化。

## 2 桌面 `main`：结论不变，但 LNX-001 的论据不足 —— 补上内容级论证

同一口径下桌面 `main`（4299 路径）：**两线都没有该路径的仅 5 个（非 docs/skill 0）**；
**共有路径内容同时异于两线的有 69 个（非 docs/skill 64）**——只看这个数会误判成"main 有 64 个独占产品内容"。

正确的判据是**方向**：`git diff --name-only b6932ea2..main` = 8 文件、非 docs/.agents **0**，
而 `b6932ea2 = merge-base(main, chat) = merge-base(main, settings)`，且 `b6932ea2 ⊆ b8c2e0b6`（两线共同祖先）
〔三条均本会话复核为真〕。⇒ 那 69 处内容差异**全部是"main 停留在祖先版本 vs 两线后续演进"**，
`main` 自与桌面线分叉以来**没有新增过任何产品内容**。LNX-001 的"main 不携带线外产品成果"成立，
但**不能只引"0 独占文件"这一个指标**——它在本例恰好够，在 §1 的后端例子里就不够。

## 3 stop reason 生产侧：LNX-001 的说法过强，**撤回"合并后必然复现"**

I 审阅要求"追踪实际 producer 字段、用可控截断验证、撤回推断"。跨语言实测：

| 语言/层 | 事实 | 证据（完整 SHA + 路径:行） |
| --- | --- | --- |
| ACP 协议（上游 wire 形态） | `prompt` 的 **JSON-RPC result 里就带 `stopReason`**（夹具发 `"end_turn"`/`"cancelled"`） | runtime `a7b7b6ff…:plugins/agent-box-harnesses/tests/harness_remote/fake_acp_peer.mjs:87,129,133,140,145,157`；`…/four_harness_component.test.mjs:114,118,124` |
| JS 桥（本地通道，Linux 走这条） | **不重命名、不裁剪**地把 driver 结果原样返回：`const result = await driver.prompt({...}); return result ?? { done: true }`；driver 由方法表 `["start","create","open","prompt","abort","close","status"]` 动态加载 | `a7b7b6ff…:plugins/agent-box-harnesses/runtime/worker-entry.mjs:305-311`、`runtime/native-driver.mjs:37` |
| vendored 上游 bridge | `third_party/harness_remote/bridge/src/*.js`（在库内，`SOURCE.json` 钉 v3.0.2）对 `stopReason` **0 命中** ⇒ 不参与该字段 | `a7b7b6ff…:plugins/agent-box-harnesses/third_party/harness_remote/`（含 `PATCHES.md`） |
| Python 消费侧 | `stop = result.get("stopReason") or result.get("stop_reason")`；**clean 或缺席 ⇒ 返回 None**，docstring 明写 "We never invent a reason the Worker did not send" | `a7b7b6ff…:src/agent_box/server/execution/sidecar_backend.py:978-990` |
| Worker 控制协议（WSL/SSH 通道） | `protocols/worker/v1.schema.json` **不含 stopReason/stop_reason**；op 枚举有 `result.get`/`result.ack` 等 27 项 | `a7b7b6ff…:protocols/worker/v1.schema.json` |
| Rust worker | `workers/agent-box-worker/`（`src/main.rs`、`src/protocol.rs`、`src/artifacts.rs`）对 `stopReason`/`stop_reason` **0 命中** | `a7b7b6ff…:workers/agent-box-worker/` |
| service 线（`003b52b2…`） | 同夹具/同 JS 桥透传形态；`src` 下 `stop_reason` 0 命中（消费半也不在） | 上一任务复核 |

〔更正后的准确表述〕
1. **"来源侧完全无代码"是错的**：**载体与透传通道在**（ACP `prompt` result → JS 原样返回 → Python 读取），
   且 Python 侧对两种拼写都兼容。
2. 真正缺的是三件事：**(a)** 契约未声明——`worker-v1` schema 无此字段，wire 合同里 `message.final` 的 reason
   来源也未登记；**(b)** **仓内没有任何夹具/测试发过截断类值**（只有 `end_turn`/`cancelled`），
   所以"截断可见"这条具体路径**从未被执行过**；**(c)** 真实 harness 被输出上限截断时**到底发什么**未验证
   （若仍发 `end_turn`，Python 按 clean 处理 ⇒ 依旧无声）。
3. 因此 **LNX-001 `summary.md` §7 的"合并后仍会复现"予撤回**：那是从"未测"推出的"必错"，不成立。
   当前可主张的只是：**未证实；截断链存在一条看起来可工作的透传路径，但没有任何测试走过它。**
4. 可控验证的最短做法（本任务不执行，交 LNX-002/后续）：把某个 ACP 夹具的 prompt result 改为
   `stopReason: "max_tokens"`，跑 `tests/server/test_terminal_reason_consumer_134.py` 所覆盖的同一路径，
   观察 `server_turns.terminal_reason` 落库与 `wire/projection.py:207/173` 的 `reason` 输出。
   这只验消费半；真实 harness 行为仍属未验证。
5. 附带发现：`main` 血统里另有一套 `stop_reason` 解读器（§1 末），若 §1 的取舍改变，此项一并重看。

## 4 分支数统计范围（消解"100/96"歧义）

| 说法 | 精确含义 |
| --- | --- |
| **100** | 三个产品仓库 `refs/heads/**` 本地分支引用总数 = backend **48** + desktop **47** + studio-legacy **5**（`git for-each-ref --format='%(objectname) %(refname:short)' refs/heads/`） |
| **119 / 120** | `sources.tsv` 数据行 119 = 100 条分支行 + **19 条 worktree 登记行**（backend 10 + desktop 6 + studio 3；其中 2 条为 prunable）；文件 120 行含 1 行表头 |
| **96** | LNX-001 `disposition.md`/`summary.md` 里指"除四条主实现线以外的分支" = 100 − 4，**含两仓 `main` 与退休调度树**；`main` 本身另在 §1.1 与 §2 单独判定 |
| tracked / untracked 口径 | `git --no-optional-locks status --porcelain=v1 --untracked-files=normal`；**untracked 目录折叠为 1 条**，故与 2026-09-20 的逐文件计数（68→43、277→63、51→39、29→5、18→15）不可直接比较；**tracked 数逐字相同**（调度树 14、Studio 重构树 898、vertical 57、Desktop main 2、Studio 主树 1） |

## 5 合同面：更正"四条线覆盖 64 方法"的表述

LNX-001 `integration-analysis.md` §2 与 `summary.md` §3 写过"方法词汇表四条线完全一致"。该句仅指
**后端 `handlers.py` 提取的 64 个方法名在两线相同**，以及**两桌面线对这 64 个都有引用点**；
它**不等于**四份 JSON 都覆盖 64 个方法。实测：`registered-c4255b31`=64、chat `1a3604ee`=64、
settings `2dd26561`=64，而 runtime 的 `a1bd52a4` 快照**只有 33 个方法**（且是其 64 个的**严格子集**，
"仅快照有"的集合为空）。⇒ 准确表述应为：**四份工件里三份声明 64、一份声明 33；64/33 的差集恰好是
`accounts.*`、`assets.*`、`hooks.*`、`profiles.{clone,grantSubagent,memory,revokeSubagent,setPermissions,subagentGrants}`、
`usage.{aggregate,export}`、`executions.list`、`workspaces.gitStatus` 共 31 个方法。**
方法名与引用一致也**不证明行为一致**（行为需运行证据）。

## 6 历史服务与"构建事实"的来源标注（禁止当作当前实测）

| 说法 | 来源性质 | 本任务是否复核 |
| --- | --- | --- |
| S-1(18790)/S-2(18810)/S-3(18830)/S-4(Electron+CDP9222) 在跑、`GET /live` 200 | **引用** `control/environments.md` 与 `current-state.md` §3，由**清理执行者 2026-09-20 13:15–13:30** 实测 | **未复核**：本任务未连接任何端口、未查进程表 |
| S-1 运行版本 ≈ `b630acd`、落后其工作树 HEAD 10 个提交 | 同上（引用） | 未复核 |
| `.acceptance-bundle-c11` 被 S-3 使用 | 同上（引用 `environments.md` §1） | 未复核（未读服务命令行） |
| "本机做过 musl 构建" | **推断**，依据是本会话观察到的 `workers/agent-box-worker/target/x86_64-unknown-linux-musl/` 目录存在与 `.acceptance-bundle-musl/agent-box-worker` 为 ELF x86-64 | **只能证明"当前存在这些工件"**，不能证明构建发生在何时、由谁、用什么工具链，也不能证明它可运行 ⇒ 表述降级为"存在 Linux 形态的预编译工件" |
| `trial-serve-linux.py` 被 S-1/S-2 直接执行、故"对两条线都能跑" | **引用 + 推断**：命令行来自 `environments.md` 记录 | 脚本对两树的 import 符号与函数签名我做了静态核对（`bootstrap/runtime.py:318-320`、`storage/secrets.py` 三类、`server/transport/http/__init__.py` 重导出）；**运行等价为未验证** |
| bwrap 0.11.1、`max_user_namespaces=60432`、`unprivileged_userns_clone=1`、Python 3.14.4、node 22.22.1、npm 9.2.0、**cargo 缺失**、ELF 工件与 manifest sha256 | **本会话当前实测**（`/usr/bin/bwrap --version`、读 `/proc/sys/...`、`--version` 命令、`file`/`sha256sum`） | 是（这是本次唯一的一手环境测量） |
| "配置允许不等于 bwrap 行为可用" | 本会话明确的限定 | 未跑任何 probe |

## 7 其余两处措辞收紧

1. LNX-001 `linux-readiness.md` 的 H1 说"全树无 keyring/kwallet/libsecret/文件 store"——实测口径是
   **两棵后端产品树的 `src/` 与 `plugins/` 内无此类实现**；未扫描用户数据目录、未探测桌面环境是否提供
   secret service（见 `configuration.md` §5.1）。
2. LNX-001 `disposition.md` 中"能力级已包含"（`feature/capability-entry-v1`）依赖吸收提交 `642b1af`
   在两线可达 + 分支源文件对线零缺失 + `tests/capability/` 计数；**未做行为等价主张**，此点原文已声明，此处仅重申。
