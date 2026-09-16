# 原生目录作为唯一事实来源 —— 落地设计（Work Order 45）

日期：2026-09-16。定位：**设计决策 + 落地清单**（本单的可执行版本见
`docs/implementation/work-orders/45-native-home-storage.md`）。

依据：本仓第一手代码阅读（下文每个判断都给出 `文件:行`）；用户 2026-09-16 的三条裁决
（原生目录为唯一事实来源 / 平台各维护一份、不挂载 / SQLite 只引一份自己系统的存储）；
以及 `profile-home-authority.md` §1 §8 §9 §10 §11。

## 1 决策（用户 2026-09-16）

1. **原生状态**：每个 Profile 在**跑它的那台机器**上有一个原生目录，它是这部分事实的
   **唯一来源**。对象库不再承载原生状态的字节。
2. **产品记录**：Profile / Session / Turn / 事件账本 / 凭据 / 配置留在控制面（Windows）。
   SQLite 对原生存储**只存引用**（平台 + 定位符 + native session id + 审计摘要），不存原生字节。
3. **资产**（skill / MCP / provider 定义）与配置分离，随后从原生目录里抽出来单独统一管理
   （§9）；本单只落地第 1 条这一层。
4. **更新语义**：没有"连接时同步"；配置改控制面、下次执行生效且永不回写；原生目录只有
   harness 自己写。

## 2 目标形态

### 2.1 目录布局

```text
<平台 home 根>/                       # 在跑它的那台机器上
  <角色名>/                           # 目录名 = 角色名（pi-test / codex-plus …）
    .agentbox-profile.json            # 标记：产品 id、harness、nativeHome、创建时间
    <native_home>/                    # 注册表声明：.pi / .codex / .config/opencode / .hermes / .claude
      …                               # harness 自己写的一切（journal、缓存、它自己的 SQLite）
```

| 放置 | home 根 | 谁创建/校验目录 |
| --- | --- | --- |
| `local` | `<data_root>/profiles`（Server 就是那台机器） | Server 自己（Python） |
| `wsl` | WSL 侧 `$HOME/.agent-box/profiles` | Worker（它知道自己的 `$HOME`），Server 只给定位符 |
| `ssh` | 远端主机同理 | 由 44 的环境 provider 决定（**本单不碰**） |

- 目录名 = 角色名。名字可改、**id 不变**：标记文件里的 id 才是身份；重命名角色**不移动目录**
  （诚实记录：目录名是创建时定下的标签）。
- 角色名先归一成安全段（`[a-z0-9-]`，1..40）；归一后与同根下**另一个 id 的标记**相撞 →
  类型化拒绝 `PROFILE_HOME_CONFLICT`，绝不共用一份 home。
- **宿主绝对路径不进记录、不进部署文档**：记录里只有 `native_platform` + `home_locator`
  （`<角色名>/<native_home>`，相对该平台的 home 根），由那台机器自己解析。Windows 侧要看的
  时候经 `\\wsl.localhost\…` 看——**同一份目录的两个视角，仍只有一个来源**。

### 2.2 执行时的绑定

```text
guest /runtime/home/<native_home>        ←(RW bind)  <home 根>/<角色名>/<native_home>
guest /runtime/home/<…>/<配置文件>        ←(RO bind)  本次执行生成的配置投影（不变）
guest <state_target>/<声明的临时子路径>    ←(tmpfs)    attempt-ephemeral 遮蔽（不变）
```

三条现有规则**一条都不放松**：只读配置（harness 改不了）、tmpfs 遮蔽（Codex 的 `.tmp` /
`shell_snapshots` 这类已知泄漏/突发路径），受保护路径（只读投影覆盖的相对名不进审计）。

## 3 今天怎么走 vs 之后怎么走（第一手）

| 环节 | 今天（第一手位置） | 之后 |
| --- | --- | --- |
| 恢复 | `bootstrap/runtime.py:844 _restore_sidecar_state()` 按 `checkpoint_object_digest` 从对象库读 manifest 与字节 → `execution/sidecar.py:304 merge_state_into_bundle()` 塞进 bundle（含 `state_capture.py:175` 的 `.agentbox-state` 标记）→ `sidecar.py:349-352 view.prepare/put/commit` 上传 → `sidecar_room.py:82` 把 `view/<prefix>` 绑到 `state_target` | **删除**。harness 从自己的 home 打开；Server 不恢复、不上传 |
| 运行 | bwrap 内写 `state_target`（一份临时视图） | 写真正的 home（bind 直落到执行机的 Linux 文件系统） |
| 捕获 | `sidecar.py:577 _WorkerChannels.capture_state()` / `local_channel.py:240` 读回子树 → `sidecar_backend.py:355-362` 每文件 `objects.publish` + manifest 对象 → `repository.py:605 complete_turn(checkpoint_object_digest=…)` | 改成**审计**：列出声明子树、摘要、凭据扫描（有界 + 截断记账）→ 发布一个 manifest **对象**（记录类）→ `complete_turn` 签名不变 |
| 续接 | 靠恢复回来的那份字节 | 靠 home 里 harness 自己的 journal + 记录里的 `checkpoint_native_id` |
| 并发 | 同一 Profile 各会话各写自己的对象链，互不相干 | 同一 Profile 多轮并行 = 原生语义（见 §4） |

## 4 为什么必须"直挂"而不是"复制回写"（本单的关键决策）

**并行是硬要求**（用户 2026-09-16：像一台机器上只有一个 `.codex` 却可以好多并行）。

- **复制模型下并行必然互相覆盖**：两个并行轮各拿到一份副本，结束时各回写一次——追加型
  journal 丢行，SQLite 型状态（Hermes / OpenCode 的 `.local/share/opencode`）直接丢记录，且
  丢哪一份取决于完成顺序。要"合并"就得逐文件三方比对，而 SQLite 根本无法按文件合并。
- **直挂后语义回到 harness 自己的**：文件锁、`O_APPEND`、SQLite 事务在真实 ext4 上按原生
  语义工作——这正是 §9 实测的结论（drvfs/v9fs 上并发追加丢 74%、SQLite 直接 `database is
  locked`，所以 home 必须落在执行机的 Linux 文件系统上）。
- **直挂不是新授权等级**：workspace 本来就是宿主目录 RW 绑进沙箱；home 与它是同一类
  （跑这次执行的机器上的、我们拥有的目录），区别只是它属于 AgentBox 而不属于用户。
- **代价**：不再有"捕获-回放"的字节级证据链，改由 §7 的派生审计补偿。

## 5 代码改动清单

| # | 位置 | 现在 | 改成 |
| --- | --- | --- | --- |
| 1 | `workers/agent-box-worker/src/{main.rs,protocol.rs,views*.rs}`（Rust） | 只有 view（临时、attempt 结束即删、随 root 删除） | 新增 **home 操作族**：`home.prepare`（建 `<home-root>/<locator>`、写/校验标记、返回路径）、`home.list`、`home.get`（读路径复用现有审计过的实现）。home 根：`--home-root` 缺省为自己 `$HOME/.agent-box/profiles`，**在 `--root` 之外**（root 退出时会被删）；home 目录 attempt 结束**不删**。控制协议 **3→4 双向拒绝**（旧 Worker 拒新客户端、新 Worker 拒旧客户端），bundle **c9** |
| 2 | `plugins/agent-box-runtime-wsl/src/agent_box_runtime_wsl/{connector.py,execution.py,client.py}` | 只透传 view/secret/spawn | 透传 home 操作；不使用 `wsl.exe` 直接 `mkdir`（保持"只有 Worker 在被控机上动文件"） |
| 3 | `src/agent_box/server/execution/sidecar.py` | `WslSidecarLauncher.__init__` merge state、`launch` 上传 state bundle；`_WorkerChannels._state_snapshot` 读 view | 不再恢复/上传；先 `home.prepare` 拿宿主目录，作为房间的 state 绑定源；审计读 `home.list`/`home.get`（同一套 `state_capture` 规则） |
| 4 | `src/agent_box/server/execution/local_channel.py` | 临时 view + 恢复 + 读回 | home = `<data_root>/profiles/<角色名>/<native_home>`：mkdir + 标记校验 + 审计（Python 直做） |
| 5 | `plugins/agent-box-sandbox-bwrap/src/agent_box_sandbox_bwrap/sidecar_room.py` | `state_bundle_prefix` → 绑 `view/<prefix>` | `state_home_source`（宿主目录）→ 绑 `/runtime/home/<native_home>`；tmpfs、RO 配置、bind 顺序不变 |
| 6 | `src/agent_box/server/bootstrap/runtime.py` | `_restore_sidecar_state`、`_state_bundle_prefix` | 删恢复；`port_factory` 解析 home（本机 = 数据根；wsl = 通道报告），`native_home` 取自注册表 `descriptor.profile.native_home`（`plugins/agent-box-harnesses/…/registry/schema.py:31`） |
| 7 | `src/agent_box/server/execution/state_capture.py` | 捕获规则 + marker + `merge_state_into_bundle` | 保留规则；删 marker / bundle 合并；新增 `audit_snapshot()`（有界、**截断事实**、凭据命中） |
| 8 | `src/agent_box/server/execution/sidecar_backend.py` | `_complete` 逐文件 publish | 写审计 manifest（schema_version **3**：`nativeSessionId` / `harnessType` / `nativePlatform` / `homeLocator` / `files[]` / `truncated`）并发布为**记录对象**；凭据命中 → 类型化失败 + 删掉**命中的那一个文件**（里面是我们注入的那次性值）+ 记账 |
| 9 | `src/agent_box/server/sessions/repository.py` | `server_sessions.checkpoint_object_digest/checkpoint_native_id` | 新增列 `native_platform`、`home_locator`；`complete_turn` 多两个参数；`get_session` 的 `checkpoint` 字典**键不变**（`object_digest` 改指向审计 manifest，语义仍成立） |
| 10 | 部署产出器（四家 `production.py`） | `stateProjection.target` | **不改文档**：`target` 仍声明审计窗口 + 临时路径；`nativeHome` 从注册表读，不进文档（保持"同一份部署文档"这条规矩） |

**明确不动**：wire（28 方法、`wire/1`、TS 与生成工件摘要）、事件 kind 与事件载荷
（前端 `EventFrame` 是严格 schema，加字段会破合同）、`checkpoint_native_id` 语义、
四家注册表能力声明。

## 6 记录与引用（SQLite）

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| Profile / Session / Turn / 事件 | SQLite（Windows） | 产品历史的唯一来源（平台消失历史仍在） |
| `native_platform` | 新增列 | `local` / `wsl`（`ssh` 待 44） |
| `home_locator` | 新增列 | `<角色名>/<native_home>`，相对该平台 home 根；**不是**宿主绝对路径 |
| `checkpoint_native_id` | 不变 | 原生 session id（续接靠它） |
| `checkpoint_object_digest` | 不变（含义更新） | 指向**审计 manifest 对象**（每文件摘要 + 树摘要 + 来源 turn/native id + 截断事实） |
| 原生字节 | 该平台的 home 目录 | **只有一份**；SQLite 永不复制它 |

## 7 失去什么、怎么补偿（如实）

| 失去（对象库曾免费给的） | 补偿 |
| --- | --- |
| 内容寻址的不可变、去重 | 每轮审计 manifest（源 turn/native id）作为记录对象 |
| 读时逐字节校验 | 审计时逐文件摘要；**漂移检测**：与上一次 manifest 比对，不一致如实上报（类型化事实，不静默） |
| 与数据库行的事务一致 | 审计对象在 turn 完成时写；两者不一致时以"审计缺失"如实呈现 |
| 8 MiB / 256 文件有界 | 审计有界 + **截断事实**（`truncated`）如实写进 manifest；门槛上下（gate）断言"本轮无截断" |
| —— | 凭据扫描 **fail-closed** 保留（注入值精确匹配）；tmpfs 遮蔽保留；只读配置保留 |

新增运维事实：home 会随 harness 自然增长（缓存、`plugins` 解包等）。本单只做"如实审计 + 截断
记账"，磁盘配额/清理策略列为未决（§10）。

## 8 门（必须第一手证据）

| 门 | 断言 | 跑法 |
| --- | --- | --- |
| **G1 一轮写目录** | 一轮对话后 `<home 根>/<角色>/<native_home>/…` 出现该 harness 的 journal；对象库里**没有**状态字节对象；审计 manifest 记录了它的摘要 | 本机放置直接跑；WSL 用替换门 |
| **G2 二轮靠 home 续接** | 第二轮**没有任何恢复步骤**（断言未调用恢复、bundle 无状态文件）仍续接，且模型**真召回**首轮 nonce；native id 稳定 | 复用 Pi 全链门的假端点两轮 nonce |
| **G3 并行不丢** | 同一 Profile 两个并行轮（两会话）都完成，两份记录**都在** home 里（追加型 journal 行数守恒；SQLite 型状态两条都在） | 新脚本：两条并发 turn → 校验并集 |
| **G4 凭据与遮蔽** | 注入的每次性凭据值在 home 里零命中（命中即失败 + 删该文件 + 记账）；`.tmp` / `shell_snapshots` 仍被 tmpfs 遮蔽；截断时如实写 `truncated` | 沿用四家门的凭据观察器 + 反例注入 |
| **G5 不退化** | 四家假端点全链门（Pi/Hermes/OpenCode + Codex，c9 上）exit 0；全量套件 ≥ 基线 `886 passed / 6 skipped`；Windows r4 + `-PostCheck` 用 c9 通过 | 既有命令，逐条复跑 |
| **G6 漂移可见** | 手工改动 home 里一个字节 → 下一轮审计报漂移（类型化/记账），两条路都不得静默 | 定向脚本 |
| **G7 人手 UI 路径** | 真实应用里 S2bis 之后那几步（第二轮上下文、停止、重启续接）重跑通过 | 人手 UI 手册的后续阶段 |
| **G8 取消后仍连续**（F4） | 一轮中途取消 → harness **已经写下的**内容留在 home 里；下一轮同一 native id 重开**看得到那句输入**；产品记录如实说明（取消 ≠ 输入消失）；追加型 journal 的半行不影响重开 | 定向脚本：发一条 → 中途取消 → 再发一条问"上一条说了什么"（假端点） |

G1–G5 是**必过**；G6、G7、G8 同属本单验收，跑不了就按 §11 阻塞账如实记，不许写成通过。

## 9 不在本单范围 / 下一层：可单独管理的资产

**本单不碰**：ssh 放置（44）、Windows 原生放置（需要另一套隔离载体）、磁盘配额策略。

**下一层（用户 2026-09-16 点名的方向）**：skill / MCP / provider 这类**可单独统一管理的资产**，
它们和配置是分离的。目标形态：

| 概念 | 放哪 | 现状（第一手） |
| --- | --- | --- |
| 资产 = 有身份、有版本、有摘要的声明（skill 目录树 / MCP server 定义 / provider-model 定义 / instruction） | 控制面，**一个根**（`<data_root>/assets/<kind>/<id>/<revision>/`）+ 每资产一份 manifest | 已存在两处但形态不同：skill 在插件数据目录（`extensions/loader.py:65` → `agent-box-skills` 的 `SkillStore`，有 `skill_id`/`revision`/`digest`），provider-model 在 SQLite（`server_provider_models`） |
| 配置 = 绑哪些资产（id + revision） | 控制面 Profile 配置（`server_profiles.config_object_digest`） | 今天只绑 provider/model |
| 物化 = 按 harness 的**槽位**把资产渲染进只读投影 | 每次执行，物化后即 RO、永不回写 | 注册表已声明槽位：`slots = [provider, permission, instruction, mcp, skill]`、`skill_target = /runtime/home/skills/{skill_id}`（`harnesses.toml:29-31` 等） |

抽离的顺序（各自单独一个工单，不与本单混）：① 统一资产的**身份/引用/物化**三条规则（先不搬家）；
② 把 skill 与 provider 归到同一个根与同一套 manifest；③ 新增 MCP 与 instruction 资产；④ 每家的
槽位物化回归。**本单只保证**：home 是原生状态的唯一来源，资产永远不是 home 里的权威副本，
harness 对槽位的写入无效（RO）。

## 10 未决与代价

1. **home 增长**：长期运行会积累缓存/解包语料。本单只如实审计 + 截断记账；配额与清理策略另议
   （可能是"按 Profile 设上限 + 超限类型化拒绝"）。
2. **`--home-root` 的粒度**：本单按"一台机器一个 home 根"实现。多发行版/多用户共用一个 Server 时，
   根应挂到环境上而不是 Server 上——那是 44 的环境 provider 该收的口。
3. **Windows 原生放置**：仍是空白（需要 Windows 容器/AppContainer 一类载体），本单不覆盖。
4. **审计的凭据扫描范围**：扫描声明子树（有界）。声明之外的 harness 自留地（例如它自己的缓存
   目录）不在扫描窗口内——除非 deployment 把它纳入 `stateProjection`。这条残留风险如实记录。
5. **既有会话的连续性**：见 §11。
6. **home 不随控制面走**（用户已裁决：各平台各一份、不同步）：把一个已有 Profile 换到另一台机器
   执行 = **新的原生会话**（历史仍在 SQLite，模型连续性从零开始）。这是换取"执行机上的原生语义"
   的代价，如实记录。

## 11 迁移：不迁移 + 诚实回退（推荐）

- 旧模型下已存在的 checkpoint 对象**保留为历史记录**（39 的"保留历史检查点"要求不变）。
- 那些会话在改造后首次运行时**没有 home**，因此按 §11.3 的规则处理：**开一个新的原生会话并在
  产品里说清**（历史还在、模型连续性从零开始），绝不假装续接成功。
- 理由：产品还没有真实用户；为一批手动测试会话写一次有界导入（对象 → home，WSL 侧还要跨
  `wsl.exe` 传字节）是纯成本。若用户要求连续，再单开一单做"有界一次性导入"。

## 12 F4（取消后丢上下文）与本改造的关系

第一手记录见 `fullstack/ui-manual-run.md` §S5bis。机制（代码第一手）：

- `sidecar_backend.py:328-338` 的取消分支在 `capture_execution()`（第 343 行，**唯一**把状态读回来的
  地方）**之前** return，沙箱视图随后被丢弃；
- `repository.py:705-733 finish_cancelled()` 写 `state='cancelled', capture_state='not-captured'`，
  **不动** session 的 `checkpoint_object_digest` / `checkpoint_native_id`。

于是下一轮恢复的是**上一轮**的原生状态：被取消那轮里 harness 已经写下的那句输入（以及半截回答）
一起消失，而产品转写里那句话还在——用户看到的"模型不承认我说过"是真话。

**根因就是复制模型本身**：状态只活在一次性视图里，"不捕获 = 全丢"。直挂之后没有这一步：进程被
杀、目录还在，harness 下一轮从**同一份原生目录**按 native id 重开，看到的就是原生语义下本来该有的
东西（你自己 Ctrl-C 一个原生 CLI，转写里那句输入也不会消失）。

- **F4 的"输入消失"由此消除**，由 **G8** 断言；
- **产品层的说明仍值得做**（§S5bis 的"小改"，措辞要改）：不再是"其输入未进入下一轮上下文"，而是
  "这一轮被中止、内容可能只完成了一部分"；
- **边界（如实）**：能不能留下，取决于 harness 在被告停之前是否已经落盘；落盘前被停就什么也没有
  （也没有可丢的）。追加型 journal 可能留下半行——原生工具自己容忍，本单用 G8 验证"半行不影响重开"；
- **顺带消掉的一整类现象**（都是捕获路径的产物，直挂后不再是失败源）：`SIDECAR_STATE_NOT_SETTLED` /
  `VIEW_CHANGED` / `SIDECAR_STATE_IDENTITY_CONFLICT` 的 settle 竞态，`VIEW_FILE_LIMIT`（Codex
  `.tmp/plugins` 那种 5529 文件突发），`VIEW_INCOMPLETE` 的间歇，8 MiB / 256 文件越界失败——在新模型
  里它们退化成**审计事实**（截断记账），不再打断一轮对话。凭据扫描仍 fail-closed，但失败形态变了：
  文件已经落盘，所以是"失败 + 删掉命中的那个文件 + 记账"，而不是"拒绝生成检查点"。
