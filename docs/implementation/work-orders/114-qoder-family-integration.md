---
id: "114"
slug: qoder-family-integration
batch: c3
baseline: "cfc4b68"
depends_on: []
write_paths: ["plugins/agent-box-harnesses/**", "plugins/agent-box-runtime-wsl/**", "plugins/agent-box-runtime-local/**", "plugins/agent-box-sandbox-bwrap/**", "src/agent_box/**", "workers/**", "protocols/**", "tests/**", "scripts/server-round1/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**"]
ruling: R-0038
terminal: ["QODER_FAMILY_DONE", "QODER_FAMILY_PARTIAL"]
waive: []
parallel_units: ["packaging", "native-config", "login-path", "placement"]
---

# Work Order 114 — 新的一家 harness：**Qoder CLI**（六件事：打包挂载 / 原生配置物化 / 账号登录 / 跨平台放置 / 门 / 未知字段如实记）

## Objective

**来源：R-0038（用户："qoder cli，可能比较新，你信息仔细查"）＋ 调度者本机一手查证**：Qoder CLI **不是** qwen-code 的新版，
是**独立一家**（账号制登录、原生落点自成一套）。按 `R-0037` 的"日常在用四家"口径，它要进**这一版**。
本单＝把它作为**第八家之外的第九家**接进产品，六件事一件不少。

## Current state（调度者本机一手，2026-09-19；阶段 1 请自己复核并补全）

| 事实 | 出处 |
| --- | --- |
| `~/.qoder/entry/qoder` 是 **bash 派发器**（"Routes `qoder …` to either Qoder CLI or Qoder IDE"），`--version` ＝ **1.1.56** | 本机一手 |
| **可无头执行**：`qodercli [options] [command] [query...]`、`-p/--print`（非交互）、`-m/--model`、`--reasoning-effort`、`--thinking <auto\|adaptive\|enabled\|disabled>`、`--thinking-budget` | `qodercli --help` 一手 |
| 原生落点：`~/.qoder/{settings.json(permissions/security/model), state.json(lastLoginMethod), .auth/, .models/, bin/qodercli, .bin/runtime-info-linux-x64-…}` ＋ `~/.qoder-cli/ai-stats/` ＋ `~/.qodersec/{config.yaml,bin,logs}` | 本机一手（**不是** qwen-code 的落点） |
| **登录＝账号制**（`.auth/` + `lastLoginMethod`；官网写 email/Google/GitHub），**不是** "provider + API key" 形态 | 本机 + 官方页 |
| qwen 的包是 `@qwen-code/qwen-code`、配置在别处 ⇒ **判为两家** | 本机一手 |

## Scope（六件事，逐件有门）

| # | From | To / action | Reason |
| --- | --- | --- | --- |
| 1 | 打包与挂载 | 按既有家族的做法产出**运行时工件**（pin 摘要、安装集条目、只读投影进沙箱） | 有得跑 |
| 2 | 原生配置物化 | 把该家的 `settings.json`（permissions/security/model）等**按 profile 物化进隔离 home**（原生 home＝`~/.qoder`，另两个 `~/.qoder-cli`/`~/.qodersec` 一并声明） | 设置做对 |
| 3 | 账号登录路径 | **账号制**：登录态在 `.auth/`（+ `state.json.lastLoginMethod`）——按 094/095 的账号模型接（**不是** provider+key）；写回只在声明的文件上、有界、原子 | 日常要用 |
| 4 | 跨平台放置 | WSL / local / Windows 三种放置各自可用（沙箱默认随放置，见 090 的语义） | R-0014 |
| 5 | 门 | **缺席即失败**：没有登录态 ⇒ 类型化拒绝（不假装可用）；没有工件 ⇒ 类型化拒绝；反例门＝把拒绝改成"照跑"必须红 | 诚实 |
| 6 | 未知字段 | 该家原生配置里**读不懂的键**：**如实登记**（键名 + 位置 + 未知），**不发明语义、不静默丢弃** | 不说假话 |

**必须保持不变**：wire 形状（**不新增方法**：`harnesses` 目录是数据驱动的，多一家只是多一条记录）；既有八家的行为；凭据纪律（登录态内容不进日志/证据）。
**明确不做**：把 Qoder 当作 qwen 的别名；改 092/093 的通用机制（本单是**消费**它们）；在 `--thinking` 等原生开关上发明我们自己的档位语义（档位属 096/107 的面）。

## Requirements

### Requirement: 第九家能被目录与 dispatch 认出来

#### Scenario: 注册表

**WHEN** 服务端注册表加载部署文档
**THEN** Qoder 作为**独立家族**出现（`id` 稳定、`credentialKind` 按账号制声明、`modelControlId` 按实际）；`server.hello.harnesses` 里多出这一条（**数据驱动，不改 wire**）

### Requirement: 账号制登录

#### Scenario: 已登录

**WHEN** 该 profile 的账号态已按 094/095 的模型就位
**THEN** 一轮真实执行可跑（假端点优先）

#### Scenario: 未登录（反例门）

**WHEN** 没有登录态
**THEN** **类型化拒绝**（指名家与原因），**不得**静默失败或假装可用

### Requirement: 未知字段如实

#### Scenario: 读不懂的键

**WHEN** `settings.json`/`state.json` 里出现本单未覆盖的键
**THEN** 登记为"未知键"（键名 + 文件 + 位置），**不猜语义**；若它影响行为，标为待观测而不是编一个含义

## Stages

- [ ] 1. 观测：CLI 的无头调用面、三个落点的实际文件、登录态形状、`settings.json` 的键（逐项一手）（提交）
- [ ] 2. 打包与挂载（工件 + 安装集 + 只读投影）（提交）
- [ ] 3. 原生配置物化 + 隔离（含未知键登记）（提交）
- [ ] 4. 账号登录路径 + 跨平台放置（提交）
- [ ] 5. 门（缺席即失败 + 反例）+ 证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 家族在册 | 注册表与 hello 目录里出现该家（独立 id） | 与 qwen 混同 ⇒ 门红 | fail (typed) |
| G2 无登录即拒 | 无登录态 ⇒ 类型化拒绝（指名家/原因） | 照跑或静默 ⇒ 门红 | fail (typed) |
| G3 无工件即拒 | 工件缺失 ⇒ 类型化拒绝 | 回落到"用系统里那份" ⇒ 门红 | fail (typed) |
| G4 物化与隔离 | 物化只写声明的文件；原生 home 隔离生效；跨版本/跨 profile 不串 | 写进用户自己的 `~/.qoder` ⇒ 门红 | fail (typed) |
| G5 未知字段 | 未知键登记表存在且逐条给出处 | 静默丢弃 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest -q tests/server -k "qoder or harness or registry"
python3 -m pytest -q tests/
git diff --check && git status --short
```

## DoD

1. 六件事 · 2. 门（G2/G3 反例）· 3. 未知键登记 · 4. 回归计数 · 5. `§Spend` 与清理 · 6. 终态行。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`QODER_FAMILY_DONE`；否则 `QODER_FAMILY_PARTIAL` + 精确剩余

## Notes for the executor

- **真实调用**：按 R-0017（假端点优先；真要跑模型时逐笔记账）。
- **与 100 的关系**：`100` 是"其余家真实 UI 门"；Qoder 的**接入**是本单，**UI 门**可在本单之后按 100 的逐家单元排（不要在本单里把 UI 门一起做掉）。
- **未知字段**这条不是形式主义：`~/.qodersec/` 与 `~/.qoder-cli/` 的用途本单尚未查实——**如实登记**它们的存在与未知，不要编。
