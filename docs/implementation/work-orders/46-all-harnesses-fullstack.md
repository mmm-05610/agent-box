# Work Order 46 — 全部 Harness 装进一台 Server，逐家全栈联调

状态：**READY_FOR_EXECUTION**（用户在 2026-09-16 口头下达，授权真实 DeepSeek 调用）。
依赖：44（环境 provider）、45（原生目录存储）**先各自到 DoD**；以及**扩展分支合并**（§1b，用户显式授权）。
设计依据：[native-home-storage-landing.md](../../server-round1/native-home-storage-landing.md)（45 的存储形态）
与本工单 §1 的第一手事实。

## §0 目标与验收

**目标**：

1. **一份部署文档装全部 8 家**（`codex / claude-code / opencode / hermes / dsh / qwen / kilo / pi`），
   同一个 Server 进程内并存；
2. **逐家全栈联调**：真实 Windows Electron → Server → `wsl.exe` → release Worker → bwrap → 该家
   harness，**真实 DeepSeek**，每家在 UI 路径上跑通一轮（不是组件门、不是假端点）；
3. **找问题、修问题**：发现的每一个问题要么修掉（带证据），要么按 §7 记录；**复杂问题不得绕过**；
4. 补文档（逐家矩阵、费用账、清理证据、问题清单），status 分账。

**验收（全部要第一手证据）**：

| 门 | 断言 |
| --- | --- |
| **G1 安装集** | 8 家的运行时工件与部署条目由**一个可复跑产出器**生成：每家的二进制/闭包摘要固定、文档**零宿主路径**（`--mount` 令牌）、两家二次构建结果一致（有差异要写明原因） |
| **G2 并存** | **同一份文档**装 8 家起 Server：`hello` 正常，UI 里能为 8 家各建一条 provider/model 记录与角色，8 个选项都出现在角色创建下拉里 |
| **G3 逐家全栈** | 对每一家跑 `apps/desktop/e2e/p42-ui-model-gate.mjs <family>`（真实 UI 路径 + 真实 DeepSeek）：逐家给出 8/8 或**如实失败项 + 复现步骤 + 原因**；不允许"大概能跑" |
| **G4 隔离与交叉** | （i）guest `HOME` 隔离对每家生效；（ii）A 家的密钥在 B 家的执行里**拿不到**（反例注入）；（iii）每家的 native home 各在各的目录（45 之后），互不覆盖 |
| **G5 不退化** | 45 的 G1–G8、44 的门、四家既有全链门、全量套件（基线以 44+45 收工时的计数为准）不退化 |
| **G6 问题账** | 每个问题有归属：已修（提交 + 证据）/ 已记录（§7）；复杂问题（需合同变更 / 需用户裁决 / 需新授权）**记录并停下该部分**，不得自行放宽 |

## §0b 开发位置

工作树 `/home/maoqh/projects/agent-box-env-provider`，分支 `feature/env-provider-v1`
（44/45/46 同一工作树、同一执行者串行）。父工作树 `/home/maoqh/projects/agent-box-server-round1`、
扩展工作树 `/home/maoqh/projects/agent-box-harness-expansion`、前端仓
`/home/maoqh/projects/agent-box-desktop-next-wsl-round1`：**只读**。
不 reset/stash/clean、不 merge main、不 push；回合并父分支仍是**之后单独一步**。

## §1 现状（本单撰写时的第一手事实）

1. **扩展分支已经补到 8 家**：`plugins/agent-box-harnesses/src/agent_box_harnesses/harnesses.toml`
   里 `harness_type` 依次为 `codex`(13) / `claude-code`(78) / `opencode`(119) / `hermes`(171) /
   `dsh`(225) / `qwen`(266) / `kilo`(307) / `pi`(353)（行号以扩展分支为准）。扩展工作树
   `/home/maoqh/projects/agent-box-harness-expansion`（分支 `feature/harness-expansion-v1`，
   HEAD `c1a7ea9`）**工作树干净**，四家新家（dsh/qwen/kilo/claude-code）在**它自己的树里**已有
   fake 与 live 门证据。
2. **每家都有 `production.py`**，暴露装机所需的全部事实：provider、产品模型 id、**原生模型值**
   （各家不同：pi `deepseek/deepseek-flash`、hermes 用官方 custom provider、dsh 是 JSON 数组
   `["deepseek-official","deepseek-flash"]`、claude-code 用 `https://api.deepseek.com/anthropic`）、
   官方 base URL、凭据 kind + **环境变量名**（pi/hermes/dsh `DEEPSEEK_API_KEY`、codex
   `CODEX_API_KEY`、claude-code `ANTHROPIC_AUTH_TOKEN`）、工件名/目标/入口、adapter 包与版本。
   → 所以"装哪几家"完全可以从这些模块**机械生成**，不需要手写文档。
3. **一份文档 = 这台 Server 装的家**：文档形状 `{"schemaVersion":1,"harnesses":[…]}`，
   `bootstrap/runtime.py:339,359` 逐条装配；文档里没有的家，直到执行时才以
   `HARNESS_DEPLOYMENT_UNAVAILABLE` 类型化拒绝。
4. **UI 侧**：provider/model 表单的 harness 是自由文本输入
   （`agent-box-model-settings.tsx:613`）；角色创建下拉 = provider/model 目录里**已出现过的**
   harness 值（`profiles/index.tsx:103`）；**wire 没有任何"这台 Server 装了哪几家"的方法**。
5. **逐家全栈门已存在且已参数化**：`apps/desktop/e2e/p42-ui-model-gate.mjs <FAMILY> <SANDBOX_ROOT>
   <OUT_DIR>`，env 传 `AGENTBOX_UI_GATE_DEPLOYMENT`（部署文档路径）、`AGENTBOX_UI_GATE_SECRET`
   （**凭据文件路径**，脚本自己读、不打印）、`AGENTBOX_UI_GATE_MODEL`；脚本会断言部署文档的
   `harnesses` 含该家。
6. **现有证据的边界（必须补齐的那一格）**：四家老家（pi/hermes/opencode/codex）各有单家族全链门
   与单家族 UI 模型门，扩展四家在扩展树里各有自己的门——**没有任何一次"同一台 Server、同一份文档、
   多家并存"**，也没有"同一进程内逐家跑真实模型"的矩阵。
7. **凭据**：用户提供的 DeepSeek key 以**文件 locator** 形式存在
   （`/home/maoqh/.agentbox-acceptance-secret.CnsAonj6/deepseek-api-key`，0600，36 字节；本单只写
   路径与权限位，**不读内容、不进 argv/日志/证据/Git**）。用户经 UI 录入的那条记录是
   `credential_15afe78b037445aea72f0d21010938f7`（`kind=api-key`，密钥在 Server 自己的 DPAPI 库里）。

## §1b 前置：把扩展分支合并进来（**用户 2026-09-16 显式授权**）

44/45/46 都在 `feature/env-provider-v1` 上，而 8 家里的后四家在
`feature/harness-expansion-v1`（基线 `d8d296d`，在父分支历史上）。所以开工 46 前必须：

```bash
git -C /home/maoqh/projects/agent-box-harness-expansion status --porcelain   # 必须 0 行
git -C /home/maoqh/projects/agent-box-harness-expansion log --oneline -1     # 记下它的 HEAD
git -C /home/maoqh/projects/agent-box-env-provider merge feature/harness-expansion-v1
```

规则（违反即返工）：

- 合并**只允许这一次**（用户授权），且必须先确认扩展工作树 clean、无并发写者；把它的 HEAD 记进报告。
- 冲突解决原则：**扩展的 harness 代码照收；本分支在 44/45 里改过的接缝（放置解析、房间、通道、
  状态/审计、部署装配）以本分支为准**，把扩展里的同类改动**逐条重放到新接缝上**——不得因为"能合上"
  就丢掉任一方的缺陷修复。
- 合并后**必须复跑**：8 家的注册表测试、扩展自己的门（至少 fake 端点那几条）、以及 45 的 G1–G8；
  任何一条回退都要先修再往下走。
- 报告里列出：冲突文件清单、每处解决方式、合并前后两侧检查点。

## §2 任务

### A 安装集产出器（`scripts/server-round1/harness-install-set.py`，新增）

- 遍历注册表里**每一家**，导入其 `production.py`，产出：
  1. **运行时工件**：能构建的构建（并把 tree digest 固定），不能构建的**校验已有工件摘要**
     （`--artifact <family>=<path>` 允许复用；不得静默重建、不得用未校验的本地版本）；
  2. **部署条目**：含 adapter/driver、`projectionFiles`、`stateProjection`、`nativeHome`（45）、
     `capabilityClaims`、`credentialKind`/`credentialEnvironment`、`modelControlId` 等**该家已实现**的字段；
  3. **模型文档**：该家 `models_document()`（官方 base URL、产品模型 id）；
- 输出（写到仓库外的运行目录，例如 `/home/maoqh/.agentbox-all-harnesses/`）：
  `deployment.json`（**一份文档装 8 家**）、`install-set.json`（家族 → 工件/入口/凭据环境变量/原生模型值/
  摘要）、`models/<family>.json`；
- **幂等、可复跑**：两次构建结果一致（或写明哪家不稳定、为什么）；
- **零宿主路径**：工件与插件源一律走 `--plugine-root` / `--mount <token>=<path>` 绑定。

### B 并存（G2）

- 用 §A 的文档起 Windows 侧 Server；UI 里为 8 家各建 provider/model 记录与角色；
- 记录"下拉里出现了几家"这一**第一手观察**（这正是 §6 缺口的证据）；
- 若某家建不起来：先分类（是 wire/后端拒绝、还是 UI 侧限制），再决定修或记录。

### C 逐家全栈（G3，真实 DeepSeek）

- 对每一家依次跑 `p42-ui-model-gate.mjs <family>`（同一份文档、同一 Server 实例，或脚本要求重启
  时文档不变），**逐家记录**：8/8 或失败项 + 复现步骤 + 原因 + 尝试过的修法；
- 每家用最小轮次（两轮 nonce 即可）；**逐笔记账**（请求数、估算费用）；
- 失败先修再复跑；修不了的按 §7 记录（不得把假端点结果记成真实门通过）。

### D 隔离与交叉（G4）

- guest `HOME` 隔离：每家一份第一手证据（沙箱内写入落到该家自己的 home，宿主 home 不可见）；
- **密钥不串**：把 A 家的密钥注入 B 家的执行（反例），断言 B 家拿不到、并在 B 家的事件/状态里零命中；
- **home 不串**：两家的 native home 目录不同、互不覆盖（45 之后应有的行为）。

### E 收口

- 问题清单（§7）、逐家矩阵（§9）、费用账、清理证据、status 分账、文档补充
  （新增 `docs/server-round1/fullstack/all-harnesses-install-set.md`：安装集形态、并存证据、
  逐家结果、问题清单）。

## §3 硬性规则（违反即返工）

- **真实模型调用本单授权**（用户 2026-09-16：允许使用他提供的 DeepSeek API，"不用害怕限制"，
  目标是找问题）。仍要：**逐笔记账**、只走真实 UI 路径门、每家用最小轮次；不得把"放宽限制"当成
  "可以随便重跑"。旧的 ¥10 上限由本次授权放宽，但**放宽不等于无需记账**。
- **凭据**：只用 §1.7 的文件 locator（或用户经 UI 录入的那条）；绝不读取真实 `~/.codex` 等登录态；
  绝不打印、不落盘到仓库、不进 argv/日志/证据/Git；报告只写 locator 路径与权限位、以及
  "已注入/零泄漏"的事实。
- **wire 不动**：28 方法、`wire/1`、事件 kind 与载荷不变；**前端仓库只读**（e2e 脚本可跑、
  参数走 env，不得改前端源码；发现必须改前端才能测的东西 → 记录为问题等裁决）。
- **45 的三条规则**（只读配置 / tmpfs 遮蔽 / 受保护路径）与 G1–G8 不得退化；**44 的门**不得退化。
- 每一家的**原生二进制/闭包摘要固定**（摘要不符即拒绝，不得替换成别的版本）。
- 复杂问题（需合同变更 / 需用户裁决 / 需新授权）**记录并停下该部分**；不得自行放宽断言、不得
  自建代理或改模型端点来"绕过去"。
- 不 reset/stash/clean、不 merge main（唯一允许的合并是 §1b 那一次）、不 push。

## §4 阶段（每阶段结束提交一次，写清检查点）

- **A** 合并扩展分支（§1b）+ 安装集产出器 + 8 家注册表/工件摘要（G1）；
- **B** 一份文档起 Server + UI 里 8 家可见可选（G2）；
- **C** 逐家真实模型 UI 门（G3），失败即修即复跑；
- **D** 隔离与交叉反例（G4）；
- **E** 收口：不退化复跑（G5）、问题账（G6）、文档与 status。

## §5 六件套 DoD

1. 实现（A–D 的提交）；2. 定向测试与反例（安装集幂等、摘要不符拒绝、密钥交叉反例、
   home 隔离反例）；3. 逐家全栈证据（每家 JSON/退出码）；4. 回归计数（45 的 G1–G8、44 的门、
   8 家注册表、全量套件）；5. status 分账；6. 清理证据（临时目录、注入值、进程、Git 状态、
   `git diff --check`）。

## §6 要评估并记录的产品缺口（**不得本单自行实现**）

**"这台 Server 装了哪几家"没有上行面。** 今天 UI 只能从 provider/model 目录里出现过的 harness 值推断；
用户可以为**没装**的家建记录与角色，直到第一轮执行才拿到 `HARNESS_DEPLOYMENT_UNAVAILABLE`——
**可用性在派发时才暴露，而不是在配置时**。本单要求：用 §B 的第一手观察记录影响，给出可选方案与代价
（例如新增 `harnesses.list`（合同变更，需重锁 wire）/ 在 `hello.capabilities` 里带只读清单 /
保持现状但把拒绝提前到 `profiles.create`），**交用户裁决**。

## §7 复杂问题记录格式

```text
问题编号：F46-<n>
现象：<一句话>
第一手证据：<命令/截图路径/事件 id/日志片段（不含密钥）>
影响面：<哪一家/哪条路径/是否阻断联调>
已尝试：<逐条 + 结果>
为什么复杂：<需要合同变更 / 需要用户裁决 / 需要新授权 / 需要前端改动 / 外部限制>
建议方案：<逐条 + 代价>
当前状态：已修（提交 <sha>）/ 已记录待裁决 / 阻塞
```

## §8 最终报告格式（必须给全）

```text
结果：ALL_HARNESSES_FULLSTACK_DONE 或 ALL_HARNESSES_FULLSTACK_PARTIAL
合并：扩展分支 HEAD、冲突文件清单与解决方式、合并后复跑结果
安装集：8 家 × {工件摘要, 部署条目, 模型文档, 凭据环境变量, 原生模型值}
并存：一份文档 8 家的 Server 证据；UI 里可见可选的家数（第一手观察）
逐家矩阵（每行一家）：家族 | UI 门结果(8/8?) | 失败项 | 请求数 | 估算费用 | 问题编号
隔离：HOME 隔离 / 密钥交叉反例 / home 互不覆盖 —— 逐条证据
不退化：45 的 G1–G8、44 的门、全量套件计数与退出码
问题账：F46-1..n 逐条（已修/已记录/阻塞）
缺口评估：§6 的结论与建议（供用户裁决）
清理：临时目录、注入值、进程、Git 状态、git diff --check
未做项与阻塞项：逐条
```

## §9 与其他单的边界

- **44 / 45**：先到 DoD；本单不改它们的接缝语义，只在上面**装配与联调**。
- **父分支合并**：`feature/env-provider-v1 → feature/server-harness-extension-v1` 仍是**之后单独一步**。
- **前端改动**：本单不改前端；§6 的缺口交用户裁决后再谈。
