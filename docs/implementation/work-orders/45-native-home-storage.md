# Work Order 45 — Native home as the single source of truth

状态：**READY_FOR_EXECUTION**。基线：本工单所在提交（见 `manifest.json` 的 45 条目）。
依赖：42（全栈交付）、43（Harness 扩容）已交付的接缝。**与 44（环境 provider）并行**：
44 写本机/远端放置，本单写**存储形态**；共享面（`placement.py`、`bootstrap/runtime.py`、
`execution/sidecar.py`、`docs/implementation/status.md`）**不得同时写**，先到先得、后到者以 44/45
的既有产出为基础串行。
设计依据（必读，本单不重复它的论证）：[原生目录落地设计](../../server-round1/native-home-storage-landing.md)。

## §0 目标与验收

**目标**：把 Profile 的原生状态从"每轮上传/下载的有界状态包"改成**跑它的那台机器上的原生目录**，
该目录成为这部分事实的**唯一来源**；控制面（SQLite）只保留**记录 + 引用**；同一 Profile 的
多轮**可并行**且互不覆盖。放不下来就**类型化拒绝**，绝不静默换地方、绝不假装续接。

**验收（全部要第一手证据；G1–G5 必过）**：

| 门 | 断言 |
| --- | --- |
| **G1** 一轮写目录 | 一轮对话后 `<home 根>/<角色名>/<native_home>/…` 出现该 harness 的 journal；对象库里**没有**状态字节对象；审计 manifest 记录了它 |
| **G2** 二轮靠 home 续接 | 第二轮**没有任何恢复步骤**（断言未调用恢复、bundle 无状态文件）仍续接，模型**真召回**首轮 nonce，native id 稳定 |
| **G3** 并行不丢 | 同一 Profile 两个**并行**轮都完成，两份记录都在 home 里（追加型 journal 行数守恒；SQLite 型状态两份都在） |
| **G4** 凭据与遮蔽 | 注入的每次性凭据值在 home 零命中（命中 = 类型化失败 + 删掉命中文件 + 记账）；`.tmp` / `shell_snapshots` 仍被 tmpfs 遮蔽；审计截断时如实写 `truncated` |
| **G5** 不退化 | 四家假端点全链门 exit 0（新 bundle）、全量套件 ≥ 基线 `886 passed / 6 skipped`、Windows r4 + `-PostCheck` 用新 bundle 通过 |
| **G6** 漂移可见 | 手工改 home 里一个字节 → 下一轮审计**报漂移**（类型化或明确记账），两条路都不得静默 |
| **G7** 人手 UI 路径 | 真实应用里第二轮上下文、停止、重启续接重跑通过（跑不了按 §8 记账，不得写成通过） |
| **G8** 取消后仍连续（F4） | 一轮中途取消 → harness **已经写下的**内容留在 home 里；下一轮同一 native id 重开**看得到那句输入**；产品记录如实说明；追加型 journal 的半行不影响重开 |

## §0b 开发位置（2026-09-16 调整：与 44 同一个工作树，44 之后串行）

**本单在 44 的工作树里做**：`/home/maoqh/projects/agent-box-env-provider`，分支
`feature/env-provider-v1`。理由：44 与 45 的写集除 `plugins/agent-box-harnesses/**`（44 独有）与
`protocols/worker/**`（45 独有）**几乎完全重叠**（`src/agent_box/**`、`workers/**`、三个
runtime/sandbox 插件、`scripts/server-round1/**`、`tests/**`、status），同一个工作树串行做掉，
就不存在两边互相踩的问题。

顺序：**先把 44 做到它的 DoD，再开始 45**；45 的基线 = 44 收工后的那个提交（写进 manifest 条目）。
父工作树 `/home/maoqh/projects/agent-box-server-round1` 与前端仓
`/home/maoqh/projects/agent-box-desktop-next-wsl-round1` **只读**。不 reset/stash/clean、
不 merge main、不 push。回合并（env-provider 分支 → 父分支）是**之后单独的一步**，本单不做。

开工前先把本单与设计文档落进自己的工作树（父工作树里是只读参考）：

```bash
P=/home/maoqh/projects/agent-box-server-round1
cp $P/docs/implementation/work-orders/45-native-home-storage.md docs/implementation/work-orders/
cp $P/docs/server-round1/native-home-storage-landing.md docs/server-round1/
cp $P/docs/implementation/native-home-storage-goal.md docs/implementation/
git -C $P rev-parse HEAD   # 记进你的提交信息：文档来源 = 父工作树这个提交
```

（父工作树此刻是干净的工作树，取到的就是含 §2b/§9 与 F4 §12/G8 的现行版本。）然后把
45 的 manifest 条目按 §9 的文本加进**自己的** manifest，提交一次（doc-only）。

## §1 现状（本单撰写时的第一手事实，逐条给位置）

1. 原生状态今天**每轮上传、每轮下载**：
   `bootstrap/runtime.py:844 _restore_sidecar_state()` 从对象库按 `checkpoint_object_digest` 读
   manifest 与字节 → `execution/sidecar.py:304 merge_state_into_bundle()` 塞进 bundle（含
   `state_capture.py:175` 的 `.agentbox-state` 标记）→ `sidecar.py:349-352 view.prepare/put/commit`
   上传 → `sidecar_room.py:82` 把 `view/<prefix>` 绑到 `state_target`。
2. 运行结束后 `sidecar.py:577 _WorkerChannels.capture_state()`（或 `local_channel.py:240`）读回子树
   → `sidecar_backend.py:355-362` 逐文件 `objects.publish` + manifest 对象 →
   `sessions/repository.py:605 complete_turn(checkpoint_object_digest=…, checkpoint_native_id=…)`。
3. Worker 的 root 是**临时**的：`runtime-wsl/connector.py:164` 传
   `--root /tmp/agentbox-worker-r1/<instance>/<project>`，`workers/agent-box-worker/src/main.rs:113`
   要求必填、退出时删除（`main.rs:127`）；view 也随 root 删除（`main.rs:271`）。→ 持久 home 必须
   在 root **之外**。
4. `native_home` 已由注册表声明：`plugins/agent-box-harnesses/.../registry/schema.py:31`
   （`.pi` / `.codex` / `.config/opencode` / `.hermes` / `.claude`），Server 侧
   `bootstrap/runtime.py:559 descriptor = registry.get(context["harness_type"])` 已可达。
5. 状态窗口与临时路径由部署声明：`bootstrap/runtime.py:474-512`（`stateProjection.target` /
   `ephemeralPaths` → `_state_bundle_prefix` / `_state_target` / `_state_ephemeral_paths`）。
6. wire 已锁：28 方法、`wire/1`，事件是**严格 schema**（前端 `EventFrame`，
   `additionalProperties:false` + 闭枚举）。`sessions.*` 的 `session_record()` 只投影显式字段
   （`wire/handlers.py:716-730`），`get_session()` 里的 `checkpoint` 字典**不出现在 wire 上**。
7. 全量基线（撰写时）：`886 passed / 6 skipped`；四家假端点门 + Windows r4 用 **c8** 通过。

## §1b 修订（2026-09-16，用户提议并采纳）

**session 子树不再住 profile home**：改为**每个 harness 一族一个公共 session 库**
（只放会话子树，按注册表声明的 session target 绑进 guest）。因此本单的实现要按
[落地设计 §14](../../server-round1/native-home-storage-landing.md) 走：
非会话状态仍落 `profiles/<角色名>/home/<native_home>/…`，**会话子树落 `sessions/<harness>/…`**；
审计与凭据扫描**按会话归属**，不得假设"该目录只被一个 profile 写过"。
**共享 DB 式的家族**（会话与其它状态同库）**无法按目录切分** → 阶段 A 逐家定性，二选一
（库留 profile home = 换 profile 原生重启；整库进公共库 = 共享但一并共享库内其它状态），**如实声明**。

## §2 本单要做的事（范围）

1. **Worker 新增 home 操作族**（Rust）：`home.prepare` / `home.list` / `home.get`。
   - home 根：`--home-root` 缺省为自己 `$HOME/.agent-box/profiles`；**在 `--root` 之外**，attempt
     结束、view 清理、Worker 退出都**不动它**。
   - `home.prepare {locator, marker}`：`locator = <角色名>/<native_home>`，只允许安全相对段
     （拒绝绝对路径、`.`/`..`、空段、反斜杠、NUL、符号链接穿越）；建目录；标记文件
     `<home 根>/<角色名>/.agentbox-profile.json` 不存在则写、存在则**校验产品 id**（不一致 →
     类型化拒绝 `PROFILE_HOME_CONFLICT`）；返回已解析的绝对路径（**只回给通道用，不进记录**）。
   - `home.list` / `home.get`：与 `view.*` 同一套已审计实现（同 bounds、同错误码家族、同样
     拒绝符号链接与特殊文件），只是基根换成 home。
   - 控制协议 **3→4**，**双向拒绝**（旧 Worker 拒新客户端、新 Worker 拒旧客户端）；bundle → **c9**。
2. **房间**：`compose_sidecar_room(state_bundle_prefix → state_home_source)`，把
   `/runtime/home/<native_home>` 绑到 home 目录（RW）；RO 配置、`--tmpfs` 临时路径、bind 顺序
   （深度升序）一条都不变。
3. **通道**：`WslSidecarLauncher` 不再恢复、不再上传 state；先 `home.prepare` 拿宿主目录，交给房间；
   审计改读 `home.list`/`home.get`。`LocalSidecarLauncher` 同语义直做（`<data_root>/profiles/…`）。
4. **后端**：删 `_restore_sidecar_state` 与 bundle 合并；`_complete` 改**审计**：
   `audit_snapshot()`（有界 + 截断事实 + 凭据精确匹配）→ 发布 manifest（`schema_version: 3`，
   含 `nativeSessionId`/`harnessType`/`nativePlatform`/`homeLocator`/`files[]`/`truncated`）
   作为**记录对象**；`complete_turn` 增加 `native_platform`、`home_locator` 两列。
5. **记录**：`server_sessions` 新增 `native_platform`、`home_locator`（都是可选列，旧行保持 NULL）；
   `checkpoint_object_digest` 含义变为"审计 manifest 对象"；`checkpoint_native_id` 不变。
6. **迁移**：不做（§11 of 设计文档）。旧 checkpoint 保留为历史记录；没有 home 的旧会话首次运行
   按"新原生会话 + 产品如实说明"处理。
7. **取消路径（F4）**：`sidecar_backend.py:328-338` 的取消分支不再"直接 return、什么都不记"——
   取消要留一次**审计**（如实说明 home 现在的样子）并保留 native id 引用；
   `finish_cancelled()`（`repository.py:705`）不再等于"这轮的输入消失"。理由、边界与新增的
   **G8** 见设计文档 §12：F4 的根因是复制模型（不捕获 = 全丢），直挂后取消回到原生语义。
   **产品层的措辞**（"这一轮被中止、内容可能只完成了一部分"）随本单一起改，不得再写"其输入未进入
   下一轮上下文"。

## §2b 协议与数据形状（照这个实现，不要自己发挥）

### (a) Worker 控制协议（`protocols/worker/`，本单独占的写面）

- `v1.schema.json`：`op` 枚举新增 `home.prepare`、`home.list`、`home.get` 三个值；
  `bootstrap.protocolVersion` 的 `const` 由 **3 改 4**，描述改成"home ops 存在"。
  握手仍**双向**拒绝（旧 Worker 拒新客户端、新 Worker 拒旧客户端），
  `README.md` 里那句"control-protocol generation（currently 3）"同步改。
- 请求/响应形状（`arguments` 一律 `additionalProperties: false`）：

```jsonc
// home.prepare —— 建目录、写/校验标记，回宿主路径
{"op":"home.prepare","arguments":{
   "locator":"pi-test/.pi",                     // 1..2 段，每段 ^[A-Za-z0-9._-]{1,64}$
   "marker":{"profileId":"profile_<hex>","harnessType":"pi","nativeHome":".pi"}
}}
→ {"path":"/home/<user>/.agent-box/profiles/pi-test/.pi",
   "created":true,"markerState":"written"}      // written | verified | absent

// home.list —— 审计窗口内的 listing（与 view.list 同形，只是基根换成 home）
{"op":"home.list","arguments":{"locator":"pi-test/.pi","relative":"agent/sessions"}}
→ {"files":[{"path":"agent/sessions/x.jsonl","size":123,"digest":"sha256:…"}],
   "truncated":{"entries":0,"bytes":0,"oversize":0},"skipped":0}

// home.get —— 分块读（与 view.get 逐字段同形）
{"op":"home.get","arguments":{"locator":"pi-test/.pi","relative":"agent/sessions/x.jsonl",
   "offset":0,"maxLength":32768}}
→ {"path":"agent/sessions/x.jsonl","offset":0,"digest":"sha256:…","data":"<base64>",
   "nextOffset":32768,"eof":false}
```

- **错误码（新，类型化；读路径复用 `view.*` 的家族）**：
  `HOME_LOCATOR_INVALID`（段不安全 / 绝对路径 / `..` / 空段 / 反斜杠 / NUL / 符号链接穿越）、
  `HOME_OUTSIDE_ROOT`（解析后不在 home 根内）、`HOME_NOT_FOUND`、`HOME_IO`；
  标记不一致由 Server 侧转成 `PROFILE_HOME_CONFLICT`（Worker 只说事实：`markerState:"conflict"` 或
  类型化 `HOME_MARKER_CONFLICT`，二选一，选定后写进 README 与测试）。
- **home 根**：Worker 启动参数 `--home-root`；缺省为自己 `$HOME/.agent-box/profiles`。
  **必须在 `--root` 之外**（`--root` 退出时会被删，见 `main.rs:113,127`）。home 目录在 attempt
  结束、`view.cleanup`、Worker 退出时**都不动**。
- `golden/` 新增 `home-prepare-request.json`、`home-list-request.json`，各含一个接受例与一个
  拒绝例（例如 `locator` 带 `..`、带绝对路径），照现有 golden 的写法。

### (b) 审计 manifest（记录对象，`schema_version: 3`）

```jsonc
{"schema_version":3,"nativeSessionId":"01a0…","harnessType":"pi",
 "nativePlatform":"wsl","homeLocator":"pi-test/.pi","sourceExecutionId":"execution_…",
 "resumable":true,
 "audited":{"files":83,"bytes":1234567,"truncated":{"entries":0,"bytes":0,"oversize":0}},
 "files":[{"path":"agent/sessions/x.jsonl","digest":"sha256:…","size":123}]}
```

- `files[].path` 仍是**相对 `stateProjection.target`**（与 schema 2 一致，便于与既有证据对照）；
  `homeLocator` 给出它属于哪个 home。
- 发布方式不变（`objects.publish(json.dumps(...))`），
  `complete_turn(checkpoint_object_digest=<manifest digest>, checkpoint_native_id=<native id>, …)` 签名不变。
- `resumable` 的算法不变（hint 能力的声明 ∩ 审计找到状态文件），**不得**因为新形状放宽。

### (c) 记录（DDL）

```sql
ALTER TABLE server_sessions ADD COLUMN native_platform TEXT;  -- local | wsl | (ssh)
ALTER TABLE server_sessions ADD COLUMN home_locator TEXT;     -- <角色名>/<native_home>
```

按 `storage/database.py` 现有 `ALTER TABLE … ADD COLUMN` 惯例写；旧行保持 NULL。
`checkpoint_object_digest` / `checkpoint_native_id` 两列不动（前者含义变为审计 manifest 对象）。
**宿主绝对路径不进这两列**（只进当次执行的 argv 与内存）。

### (d) 房间绑定顺序（唯一会"静默出错"的地方）

```text
1) --dir   /runtime/home                                  （guest home 根）
2) RW bind <home 根>/<角色名>/<native_home> → /runtime/home/<native_home>
3) RO bind 本次生成的配置文件              → /runtime/home/<…>/<config>   （比 2 深，晚绑）
4) --tmpfs 每个 ephemeralPath              → <state_target>/<relative>   （比 2 深，晚绑）
```

规则：**越深越晚绑**（`home_projection.py` 已有这条不变量，直接复用）；
**禁止**把 tmpfs 或只读配置绑在 home 之前（那会让 home 覆盖它们——HOME 隔离轮踩过一次）。
`<home>/<stateProjection.target 去掉 native_home 前缀的部分>` 必须在启动前存在（`home.prepare`
里 `mkdir -p`），否则各家 harness 对"目录不存在"的处理不一样。
**审计窗口 = `stateProjection.target`**：声明之外（harness 自留的缓存目录）**不扫描**，这条残留
风险写进报告。

### (e) 逐文件手术单（行号以撰写时为准；44 落地后按符号名定位）

| 文件 | 删 | 加 |
| --- | --- | --- |
| `bootstrap/runtime.py` | `_restore_sidecar_state()`（844-889）与它的调用（567-570）；`_state_bundle_prefix` | home 解析（本机 = `<data_root>/profiles`；wsl = 通道 `home.prepare` 报回的路径），`native_home` 取 `registry.get(...).profile.native_home` |
| `execution/sidecar.py` | `WslSidecarLauncher.__init__` 里的 `merge_state_into_bundle` 段（303-312）；`launch` 的 state 上传与 `state_bundle_prefix` 传参；`_WorkerChannels` 里对 view 的状态读 | `home.prepare` → `state_home_source`；审计读 `home.list`/`home.get`（`_matches_ephemeral_prefix`、错误码分类保留） |
| `execution/local_channel.py` | 临时 view 里的状态部分 | home = `<data_root>/profiles/<角色名>/<native_home>`：mkdir + 标记校验 + 审计（`_listing`/`_read` 基根换成 home） |
| `execution/state_capture.py` | `merge_state_into_bundle()`、`.agentbox-state` marker（76、175-178） | `audit_snapshot(...)`：复用 bounds/protected/凭据规则，越界**记账不抛**（返回 `truncated` + 命中的相对路径） |
| `execution/sidecar_backend.py` | `_complete` 里逐文件 `objects.publish`（345-362） | 审计 → 发布 manifest 3；**取消分支先审计再 `finish_cancelled`**（G8）；凭据命中 → 删命中文件 + 类型化失败 + 记账 |
| `plugins/…/sidecar_room.py` | `state_bundle_prefix` 参数 | `state_home_source`；guest 目标 `/runtime/home/<native_home>` |
| `plugins/agent-box-runtime-wsl/…/{client,connector}.py` | —— | 透传 home ops（**不要**用 `wsl.exe mkdir` 绕开 Worker） |
| `sessions/repository.py` | —— | `complete_turn` 多 `native_platform`/`home_locator` 两个参数并写入；`get_session` 的 `checkpoint` 字典**键不变** |
| 5 个门/脚本 | 对 checkpoint 里状态字节的断言 | 对 `home` 目录 + 审计 manifest 的断言（断言强度不降） |

## §3 硬性规则（违反即返工）

- **不碰 wire**：28 方法、`wire/1`、TS 与生成工件摘要不变；**不加事件 kind、不改事件载荷**。
- **不把宿主绝对路径写进记录或部署文档**：记录里只有 `native_platform` + `home_locator`。
- **只读配置、tmpfs 遮蔽、受保护路径**三条规则一条都不放松。
- **凭据**：只有每次执行的一次性投影；home 里出现注入值 = 失败 + 删除命中文件 + 记账。
  不读任何真实 locator，不打印、不进 argv/日志/证据/Git。
- **真实模型调用默认零**（全部 loopback 假端点）；确需真实调用须先取得明确授权且受 ≤¥10 约束。
- 没有观测证据的能力一律声明 false；跑不了的门按 §8 记账，**不得放宽断言凑绿**。
- 四家全链门与 Windows r4 必须在**新 bundle** 上串行复跑，旧 bundle 的结论不得挪用。

## §4 阶段（每阶段结束提交一次，写清检查点）

- **A（Rust/协议）**：home 操作族 + 持久根 + 协议 3→4 双向拒绝 + 重建 bundle c9；Rust 定向测试。
- **B（Python 通道/房间）**：房间、两个通道、`placement` 之后的绑定解析、旧路径删除；
  单元/定向测试（含"同一份房间在另一台机器上只差绑定"这类断言）。
- **C（后端记录/审计）**：`audit_snapshot()`、`_complete` 改审计、DB 列、`complete_turn`；
  反例：截断记账、凭据命中、漂移。
- **D（本机端到端）**：G1/G2/G3/G4/G6 在**本机放置**的端到端脚本里取得证据（假端点 two-round
   nonce + 并发两轮 + 漂移 + 凭据反例）。
- **E（WSL/Windows + 回归）**：G1/G2 在 WSL 链路上取得证据；四家全链门 + Windows r4/`-PostCheck`
  用 c9 复跑；全量套件计数；G7 视条件。

## §5 六件套 DoD（每项都要齐）

1. 改动实现（阶段 A–C 的提交）；
2. 定向测试 + 反例（每个新规则至少一条反例：拒绝、越界、冲突、漂移、凭据命中）；
3. 端到端门证据（G1–G4、G6 的 JSON/退出码，写进 `docs/server-round1/`）；
4. 回归计数（全量套件、四家全链门、Windows r4，逐条命令与退出码）；
5. status 分账（`docs/implementation/status.md`：过了什么、没跑什么、为什么）；
6. 清理证据（临时目录、注入值、进程、Git 状态；`git diff --check`）。

## §6 阻塞账格式（跑不了就照这个写）

```text
阻塞项：<门/步骤>
第一手观察：<命令 + 输出要点>
为什么阻塞：<外部条件 / 需要授权 / 需要用户裁决>
已尝试：<逐条>
影响：<哪些断言因此无法成立>
不掩盖声明：本项不记通过
```

## §7 最终报告格式（必须给全）

```text
结果：NATIVE_HOME_STORAGE_DONE 或 NATIVE_HOME_STORAGE_PARTIAL
过门：G1…G7 逐条（通过 / 部分 / 阻塞）
回归：全量套件计数、四家全链门、Windows r4／PostCheck（bundle 摘要逐条）
协议与工件：控制协议版本、bundle 摘要、wire 摘要（须与锁定值一致）
记录形态：新增列、manifest schema 3 样例（不含任何宿主绝对路径）
费用：模型请求数 / 增量金额（默认 0 / ¥0）
清理：临时目录、注入值、进程、Git 状态
未做项与阻塞项：逐条（含 §6 格式）
```

## §8 与其他单的边界

- **44（环境 provider）**：**先做完 44 再开始本单**（同一工作树，同一个执行者串行）。本单只做
  `local` 与 `wsl` 两种放置的 home；`ssh` 归 44（若 44 已实现 ssh 放置，本单**不为它**加特例：
  ssh 的 home 由 44 的 provider 决定，本单只要求 `native_platform="ssh"` 时走同一条审计路径）。
- **43（Harness 扩容）**：新家（families）不因本单改注册表；`native_home` 缺失 → 类型化拒绝。
- **资产层（skill/MCP/provider 抽离）**：**不在本单**，见设计文档 §9。
- **回父分支**：本单落完后 `feature/env-provider-v1` → `feature/server-harness-extension-v1` 的
  合并是**单独一步**（用户裁决后再做），本单不在执行中合并。

## §9 放进你自己 manifest 的 45 条目（照抄，按你的实际提交改两处）

```json
{
 "id": "45",
 "document": "work-orders/45-native-home-storage.md",
 "baseline": "<44 收工后的那个提交>",
 "worktree": "/home/maoqh/projects/agent-box-env-provider",
 "branch": "feature/env-provider-v1",
 "depends_on": ["44"],
 "dependency_condition": "44 reaches its DoD first; both orders run in this worktree, serialized by one executor.",
 "stages": ["A-worker-protocol", "B-channel-room", "C-records-audit", "D-local-gates", "E-wsl-regression"],
 "write_paths": ["workers/**", "protocols/worker/**", "plugins/agent-box-runtime-wsl/**",
   "plugins/agent-box-runtime-local/**", "plugins/agent-box-sandbox-bwrap/**", "src/agent_box/**",
   "tests/**", "scripts/server-round1/**", "docs/server-round1/**", "docs/implementation/status.md"],
 "forbidden_write_roots": ["/home/maoqh/projects/agent-box",
   "/home/maoqh/projects/agent-box-studio", "/home/maoqh/projects/agent-box-desktop-next",
   "/home/maoqh/projects/agent-box-desktop-next-wsl-round1",
   "/home/maoqh/projects/agent-box-server-round1"],
 "note": "Native home as the single source of truth: the profile's native state lives in a persistent directory on the machine that runs it (wsl: $HOME/.agent-box/profiles, local: <data_root>/profiles), bound RW into the sandbox; the control plane keeps records plus a reference and never the native bytes. Wire stays locked (28 methods, wire/1, no new event kinds); Worker control protocol 3 to 4 with bidirectional rejection and a new bundle c9. No migration of old checkpoints; no real model calls."
}
```

（`forbidden_write_roots` 里加了父工作树 `agent-box-server-round1`：本单执行期间它是**只读参考**。）
