# 全部 Harness 装一台 Server —— 工单 46 执行证据（§8 终版）

2026-09-17。执行者：环境 provider 会话（`feature/env-provider-v1`）。
真实模型调用（本单执行部分）：**19 次**（8 家 UI 门各 2 轮 = 16 次；r4(c9) C/D 复跑
3 次），估算费用 **<¥0.05**（DeepSeek 官方价、短轮次）。

## 0. 结果

**ALL_HARNESSES_FULLSTACK_DONE**（逐项见下）：

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| A | 合并扩展分支（§1b 一次授权合并）+ 安装集产出器 + 8 家注册表/工件摘要（G1） | **完成** |
| B | 一份文档起 Server + 8 家并存（G2 的 Server 侧第一手证据） | **完成** |
| C | 逐家真实 DeepSeek UI 门（G3，8/8 矩阵） | **完成——8 家 8/8 全过，exit 0**（见 §5） |
| D | 隔离与交叉反例（G4） | **完成**（Linux 本地 placement，wire 层） |
| E | 收口（本文档、问题账、不退化复跑、清理） | **完成** |

§6 产品缺口（F46-2）按工单要求只记录、不实现，交用户裁决——不是本单 DoD 项。

## 0b. 证据边界（诚实记账；收口复核 2026-09-17 补）

- **G4(ii) 反例注入的覆盖面**：交叉凭据反例是**两家 fixture（pi/hermes）双向**断言
  （A 的值在 B 的事件/审计/home 全树零字节，反向亦然），正控制是 **launcher 边界记账**
  （Server 递凭据的必经点、placement 无关）——它观测的是 launcher 收到的注入值，
  **不是**子进程环境块的运行时读取；"8×8 两两矩阵"未做。机制本身（凭据注入路径、
  bwrap 房间、home marker 规则）是 harness 无关的，两家 fixture 证明机制，不冒充逐家证明。
- **G4(i) "每家"的证据来源**：8 家各自的全链门（假端点）断言 home 挂载与 state 落位、
  8 家 UI 真机门证明原生会话/配置落进各自 home 目录；"宿主 home 不可见"的显式
  sentinel 反证只在部分家的门里逐字存在（以各家门输出为准），不是 8/8 的统一断言。
- **UI 门第二轮断言的已知弱点（F46-4，记录）**：第二轮的 nonce 断言从累计历史帧里
  匹配第一轮 nonce，语义是"会话历史含第一轮 nonce"，弱于"仅本轮答复回忆"——
  驱动按前者执行，判据强度以此为准，不事后拔高。
- **请求计数口径**：本单命名门轮的精确计数为 19 次（8 家 UI 门 16 + r4(c9) C/D 3）。
  C 段排障期间另有若干重跑轮到达模型后才失败（HOME_MARKER_CONFLICT 类失败发生在
  模型请求之前、不计），额外消耗未逐笔记账、粗估 <10 次、<¥0.02，无法精确补录——
  如实声明，不并入精确计数。迁移排障与最终验证的真实调用属于用户直接委托的迁移
  任务，另账（6 轮失败但模型均答复 + 2 轮最终验证成功），不在本单账内。

## 1. 合并（§1b，用户 2026-09-16 授权的那一次）

- 扩展工作树 `agent-box-harness-expansion`（`feature/harness-expansion-v1`，HEAD `c1a7ea9`）
  `status --porcelain` **0 行**，无并发写者。
- `git merge feature/harness-expansion-v1` → **3 个冲突文件**，逐处解决：
  1. `plugins/agent-box-harnesses/tests/test_capability_declarations.py`——扩展侧四个新家
     （dsh/qwen/kilo/claude-code）的 `deployment_document` 调用仍用旧 `artifact_source`
     宿主路径参数；按"44/45 接缝为准"重放到本分支的 token 合同（`artifact_token=`）。
  2. `docs/implementation/status.md`——两侧账本行都保留（本侧 44/45 行 + 扩展侧 43 行）。
  3. `docs/server-round1/fullstack/progress.md`——两侧追加内容都保留。
- 合并后复跑：8 家注册表（`load_builtin_registry` 列出全部 8 家）✅；
  `plugins/agent-box-harnesses/tests/` **195 passed / 3 skipped** ✅（本单收口时复跑同数）。

## 2. 安装集（§A 产出）

`scripts/server-round1/harness-install-set.py`：遍历 8 家注册表，逐家构建或校验运行时工件并
固定 tree digest；`--artifact <family>=<path>` 复用已验证工件；幂等（第二次运行零重建、
deployment sha 逐字节一致）。**一份 deployment.json 装 8 家**（zero host paths：工件走
`--mount` 令牌绑定）；`install-set.json` 逐家记录 mount 令牌、工件路径、凭据环境变量、
原生模型值、入口、`models/<family>.json`。产出目录 `/home/maoqh/.agentbox-all-harnesses/`
（仓库外运行目录）。

| 家族 | 工件 tree digest | 凭据环境变量 | 原生模型值 | 模型文档 |
| --- | --- | --- | --- | --- |
| codex | `sha256:9051b844…` | `CODEX_API_KEY` | `deepseek-flash` | `models/codex.json` |
| claude-code | `sha256:3e28ead4…` | `ANTHROPIC_AUTH_TOKEN` | `deepseek-flash` | `models/claude-code.json` |
| opencode | `sha256:c9485f62…`（固定 1.18.21 单文件二进制） | `DEEPSEEK_API_KEY` | `deepseek/deepseek-flash` | `models/opencode.json` |
| hermes | `sha256:3ffa9ee4…` | `DEEPSEEK_API_KEY` | `deepseek-flash` | `models/hermes.json` |
| dsh | `sha256:3297c3ed…` | `DEEPSEEK_API_KEY` | `["deepseek-official","deepseek-flash"]` | `models/dsh.json` |
| qwen | `sha256:eeae89ee…` | `OPENAI_API_KEY` | `$runtime\|openai\|deepseek-flash(openai)` | `models/qwen.json` |
| kilo | `sha256:f46f1b4a…` | `OPENAI_API_KEY` | `deepseek/deepseek-flash` | `models/kilo.json` |
| pi | `sha256:afe238d3…` | `DEEPSEEK_API_KEY` | `deepseek/deepseek-flash` | `models/pi.json` |

deployment.json 整文档摘要：`sha256:5dce588bbbfd992b1dd8212be1730a05f461271849bd8f4f9b898b3278fff0ad`。

## 3. 并存（§B，G2 的 Server 侧第一手证据）

`scripts/server-round1/all-harnesses-coexistence.py`：**一个 Server 进程、一份 8 家
deployment.json**（`build_runtime_from_sidecar_deployment` + `--mount` 令牌绑定）上，
`server.hello`（wire/1）✅，逐家完成 `workspaces.open` → `profiles.create`（8/8 全部 201）→
`providerModels.create`（8/8 全部成功，`provider_<hex>` 逐家在档）→ 第二角色再建（8/8）。
证据 JSON：`docs/server-round1/fullstack/all-harnesses-coexistence.json`。

UI 层观察在 §5 的 G3 门中补齐：8 家经真实 Electron 界面逐一驱动
（真实应用即"下拉里可选"的第一手载体），全部可选可用。

## 4. 逐家矩阵（§8 要求的每行一家）

2026-09-17，真实 Windows Electron + 真实 Windows Server + 真实 WSL Worker + 真实 DeepSeek，
每家一份驱动报告（[ui-gates-46/](ui-gates-46/)，8/8 步骤全 PASS、exit 0）：

| 家族 | 安装集 | 并存（Server 侧） | 真实 DeepSeek UI 门 | 真实请求数 | 估算费用 | 凭据录入 |
| --- | --- | --- | --- | --- | --- | --- |
| codex | ✅ digest 在档 | ✅ 201 ×2 + providerModel | **8/8 PASS exit 0** | 2 | <¥0.01 | 界面录入 |
| claude-code | ✅ | ✅ | **8/8 PASS exit 0**（二轮 685 字符、nonce ×3） | 2 | <¥0.01 | 界面录入 |
| opencode | ✅ | ✅ | **8/8 PASS exit 0**（二轮 final 完整含双 nonce，42 时代的尾部丢失未复现） | 2 | <¥0.01 | 界面录入 |
| hermes | ✅ | ✅ | **8/8 PASS exit 0** | 2 | <¥0.01 | 界面录入 |
| dsh | ✅ | ✅ | **8/8 PASS exit 0** | 2 | <¥0.01 | 界面录入 |
| qwen | ✅ | ✅ | **8/8 PASS exit 0**（写入自家记忆文件，二轮 148 字符） | 2 | <¥0.01 | 界面录入 |
| kilo | ✅ | ✅ | **8/8 PASS exit 0** | 2 | <¥0.01 | 界面录入 |
| pi | ✅ | ✅ | **8/8 PASS exit 0** | 2 | <¥0.01 | 界面录入 |

记账口径：每家 2 次主请求（两轮），合计 16 次；可能存在的后台 title 类零星调用
未单独计数，估算总量级 <¥0.05。凭据经界面自己的录入路径进入，零泄漏（驱动在
写证据前自扫描输出，命中即拒绝写出）。

### 4.1 G3 运行方式（2026-09-17 补齐，推翻 F46-1 的资源判断）

门脚本 `apps/desktop/e2e/p42-ui-model-gate.mjs`（前端仓，只读，一行未改）从 WSL 经
Windows 互操作驱动：`powershell.exe` + 便携 node 22.22 + playwright 驱动 electron.exe
（Windows 进程），Server 用 `py.exe -3.12` 起（PYTHONPATH 经 `\\wsl.localhost` 指向
本工作树），Worker 走 WSL 通道（c8 槽位换入协议 4 musl 构建，`49086425…`，脚本槽位名
是只读合同，内容为本单固定摘要）。运行副本 = 前端仓 HEAD `5b647a47` 的工作树拷贝
（0 脏），dist 为副本内重建；只读仓零写入。

同一份 8 家 deployment.json（§2 的 `5dce588b…`）贯穿 8 次运行——满足"同一份文档、
同一 Server 形态"的要求；`--plugin-root` 与 8 个 `--mount` 绑定经启动包装器注入
（脚本不感知，前端零改动）。

## 5. 隔离与交叉（§D，G4）—— 逐条证据

`scripts/server-round1/all-harnesses-isolation-gate.py` →
`docs/server-round1/fullstack/all-harnesses-isolation.json`，**ISOLATION_GATE_OK / exit 0**
（2026-09-17，Linux 本地 placement；无模型调用，受控 peer 自答）。同一 Server、同一
workspace 上两个家族各建 Profile 各跑一轮（pi 凭据 A，hermes 凭据 B——各自独立的
MemorySecretStore 注入记录）：

- **home 各在各的目录、互不覆盖**：A 的会话事实只落在 `<role>/.pi/`，B 的只落在
  `<role>/.hermes/`；两目录互不为对方子树（overlap 断言 0 命中）；每家 marker
  （`.agentbox-profile.json`）各自记录自己的 profileId/harnessType，另一家 Profile
  复用同一目录会被 marker 规则类型化拒绝（45 语义，不退化）。
- **密钥不串（反例 + 正控制）**：
  - 反例断言：B 的事件流、B 的审计 manifest（checkpoint 对象全文）、B 的 home 树里
    A 的凭据值**零字节**（`profileBHomeHits: 0`、`profileBAuditClean`、
    `profileBEventsClean`）；两 home 全树扫 A 的值字节 0 命中。
  - **正控制**（没有它上述反例可能是空过）：launcher 边界记账每个 room 实际被递了
    什么凭据（sha256+长度，值不落报告）——A 的 room 收到且只收到 A 的值
    （digest 与源逐字节一致），B 的 room 收到且只收到 B 的值
    （`profileBRoomCredentialSha256` ≠ A 的 digest）。room 侧不另作文件级正控制：
    本地 placement 的 room 是临时的，peer 侧文件随 room 消亡；launcher 边界是
    Server 递凭据的必经点，且 placement 无关。
  - 若正控制缺失，门以 `ISOLATION_GATE_INJECTION_UNPROVEN` 类型化失败，不会静默通过。
- **产品侧 fail-closed 不退化**：审计管线的 SIDECAR_STATE_CONTAINS_SECRET 规则
  （凭据值入 home → 类型化失败 + 删除命中文件）由 45 的单测覆盖，本门未放宽。

## 6. 不退化（§E）

| 门 | 结果 |
| --- | --- |
| 44 本地 placement 门（`env-provider-gate.py --placement local`） | **LOCAL_ENV_GATE_OK / exit 0**（2026-09-17 复跑） |
| 44 ssh placement 门（`--placement ssh`） | **SSH_ENV_GATE_OK / exit 0**（2026-09-17 复跑；先修复 F46-3 再跑） |
| 45 G 门（G1/G2/G6/G8） | **NATIVE_HOME_GATE_OK / exit 0**（2026-09-17 复跑） |
| 45 G5 Windows r4(c9) 全套 + PostCheck | **A/B/C/D/E + PostCheck 全部 exit 0**（2026-09-17 补齐，含 3 次真实 Codex 请求；见 45 证据文档 §8 与 [windows-r4c9/](windows-r4c9/)） |
| 45 G3 / G5-Windows / G7 | 未过/未跑——维持 45 的记账（产品裁决/外部资源），本次无变化 |
| 8 家注册表 + 插件测试 | **195 passed / 3 skipped** |
| 全量套件（`tests/`，全部插件 src 入 PYTHONPATH） | **608 passed / 1 skipped / 0 failed，exit 0** |
| wire 不动 | 28 方法、`wire/1`、事件 kind 与载荷：无改动（`git diff` 本单 src 变更仅 45/46 已记项） |

## 7. 问题账（§7 格式，F46-1..3）

```text
问题编号：F46-1（已闭合，2026-09-17）
现象：G3 逐家真实模型 UI 门（8/8 矩阵）最初被记为"无法执行"
原判断：门脚本平台假设（window.agentBoxDesktop.wire、py.exe、taskkill）被误读为
  "无 Windows 会话可用"；用户指出 WSL 可直调 Windows PowerShell——实探证实
  powershell.exe/py.exe 3.12/WSL 互操作全通，此前判断错误
处置：Windows 侧搭运行环境（前端工作树副本 + 重建 dist + 便携 node 22.22 + websockets）、
  c8 槽位换入协议 4 worker、launch 包装器注入 --plugin-root/--mount，8 家逐家跑通
结果：8/8 家 8/8 步骤 PASS、exit 0；真实 DeepSeek 16 次主请求、<¥0.05（已记账）
经验：前端仓只读未破——副本内重建与运行，源仓零写入；假端点从未冒充真实门
当前状态：已修（本提交；45 的 G5 Windows 腿同路径补齐，见 45 证据文档 §8）
```

```text
问题编号：F46-2
现象：§6 产品缺口——"这台 Server 装了哪几家"没有上行面
第一手证据：UI 只能从 provider/model 目录里出现过的 harness 值推断；可为"没装"的家建
  记录与角色，直到第一轮执行才拿到 HARNESS_DEPLOYMENT_UNAVAILABLE——可用性在派发时
  才暴露，而不是在配置时
影响面：全部 8 家的配置期体验；不阻断联调，但错误暴露晚
已尝试：本单按工单要求只记录、不实现
为什么复杂：需用户裁决（三个方案都各有代价）
建议方案：1) 新增 harnesses.list（合同变更，需重锁 wire）；2) hello.capabilities 附
  只读清单（无需合同重锁，但 hello 载荷变大）；3) 保持现状，把拒绝提前到
  profiles.create（最小改动，但"装了哪几家"仍不可枚举）
当前状态：已记录待裁决
```

```text
问题编号：F46-3
现象：44 的 ssh 门在本单收口复跑时 workspaces.open 即 WORKER_UNREACHABLE
  （WORKER_DISCONNECTED：Worker control stream closed）
第一手证据：本地手工 WorkerClient 对远端二进制握手 → 远端 worker 报
  PROTOCOL_VERSION_UNSUPPORTED: client bootstrap 4 != worker 3；远端部署的二进制
  sha256:163e6d3e… 是 44 期的协议 3 构建，45-A 已把控制协议升到 4（双向拒绝按设计生效）
影响面：仅 ssh placement 的收口复跑；本地 placement 与全部单测不受影响
已尝试：1) 直探远端二进制可启动（排除主机/网络）；2) 复现连接器 argv（排除 ssh 配置）；
  3) 以当前源码重建 musl 静态 bundle（cargo build --release --target
  x86_64-unknown-linux-musl），新 digest sha256:49086425…，重写 manifest 并重部署远端；
  4) 复跑 ssh 门 → SSH_ENV_GATE_OK / exit 0
为什么复杂：不复杂——跨单的部署漂移（45 改协议，44 部署的远端二进制未同步），
  属收口复跑应当抓住的问题
建议方案：无需进一步动作；44 证据文档（local-ssh-env-providers.md）已加日期注记说明
  digest 变更原因
当前状态：已修（本提交；重建脚本化前每次升级后需重跑 44 ssh 门验证部署同步）
```

## 8. §6 缺口评估（结论与建议，供用户裁决）

- **影响（第一手）**：并存阶段 Server 侧 8/8 可建可选，但"装了哪几家"无法上行枚举；
  可用性错误（HARNESS_DEPLOYMENT_UNAVAILABLE）在第一轮派发才暴露。UI 层对应观察因
  F46-1 缺席，暂以 Server 侧证据入档。
- **建议**：优先考虑方案 2（`hello.capabilities` 附只读清单）——不重锁 wire、改动面
  最小；方案 1（`harnesses.list`）语义最干净但需合同变更；方案 3 只是提前报错，
  不解决枚举。三者均**不在本单实现**。

## 9. 清理（§5 DoD 第 6 条）

- 临时目录：隔离门/coexistence 门/安装集运行目录自清理；失败调试期遗留的
  `/tmp/agentbox-isolation-gate-*`、`/tmp/agentbox-ssh-probe*`、本机与远端
  `/tmp/agentbox-worker-r1/probe*`、远端 `server_*` 残根已全部删除（复验 0 项）；
  G3 的 8 个 Windows 沙箱（含应用的 credentials.json）逐个删除；r4 A–D 的数据根、
  E 的数据根（门自清理 + PostCheck 复核零残留）、失败运行的 WSL 侧 home（marker
  规则按设计拒绝异主重入）全部清除。C:\agentbox-uigate46（前端副本 + 便携 node）
  与 r4c9 venv 为可复用运行环境，保留并在本节登记。
- 注入值：隔离门的两个凭据值是门内生成的合成串，仅存在于门进程与临时目录（已删）；
  仓库/Git/日志/证据 JSON 中零出现（报告只含 sha256 与长度）。
- 进程：本机无残留 `agent-box-worker`/peer 进程；远端 `pgrep -x agent-box-worker` 空。
- Git 状态：`git diff --check` 干净；本单阶段提交不含任何凭据内容或宿主绝对路径入档。

## 10. 未做项与阻塞项（逐条）

1. ~~G3 逐家真实 DeepSeek UI 门~~——已完成（2026-09-17，8 家 8/8，见 §4/§5）。
2. ~~Windows r4(c9) 复跑（45-G5 Windows 腿）~~——已完成（A/B/C/D/E + PostCheck 全绿）。
3. 45-G7 的"应用驱动停止/重启续接"未单独立跑——二轮上下文已由 G3 真实应用覆盖，
   续接能力已由 r4 C/D 与 E 双层覆盖（45 证据文档 §8 记"部分覆盖"）。
4. 45-G3（同 Profile 并行 Session）——产品语义裁决未决（45 记账延续）。
5. §6 缺口的任一修复方案——F46-2，待用户裁决。
6. musl worker bundle 重建尚未脚本化（本次以 cargo 命令重建）——低优先级改进项。
