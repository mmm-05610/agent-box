# Work Order 114 — Qoder CLI 第九家接入：阶段 1 一手观测与集成计划

终态：见 `status.md` 114 行（本单尚未收口；本文件＝阶段 1）。§Spend：仅本机只读观测，零模型调用。

## 1 一手观测（本机 2026-09-19，凭据值一律只记键名/结构、不落值）

**派发器/版本**：`~/.qoder/entry/qoder`（bash 派发器）。`qoder --version` = **1.1.57**
（调度者记 1.1.56 ⇒ 版本在动，记为事实不锚定）。

**无头调用面**（`qodercli --help` 一手）：`qodercli [options] [command] [query...]`，默认交互，`-p/--print` 非交互退出。
相关开关（**只作接入事实，档位语义归 096/107，本单不发明**）：
`-m/--model <name|modelID>`、`--list-models`、`--thinking <auto|adaptive|enabled|disabled>`、`--thinking-budget <tokens>`、
`--reasoning-effort <level>`、`--permission-mode <bypass_permissions|dont_ask|auto>`、`--dangerously-skip-permissions`、
`--max-output-tokens <size>`、`-o/--output-format <format>`、`--max-model-request-retries <count>`、`--remote [task]`、
`--resume`（仅配合 `--print`）。⇒ 可无头跑，接入形态与既有 ACP/直连家族同构。

**原生落点（三个 root，皆一手 ls）**：
- `~/.qoder/`：`settings.json`、`state.json`、`.auth/`（登录态：仅见文件名 `user`/`machine_id`/`dynamic-*.json`，**未读内容**）、
  `.models/`（`<uuid>`、`default`）、`.bin/`、`bin/`、`.cache/`、`cache/`、`entry/`、`installation_id`、`logs/`、`tmp/`，
  以及**运行态目录** `external-commands/ file-history/ plugins/ projects/ security-resources/ session-env/ shell-snapshots/ tasks/`。
- `~/.qodersec/`：`config.yaml`（CodeSec 安全评审工具的配置文件；见其头注释"full-field reference / first-run seed"）、`bin/`、`logs/`、`state/`。
- `~/.qoder-cli/ai-stats/`：`commit-report-receipts/`、`projects/`、大量 `verified-<sha>.json`（提交统计回执遥测）。

**`settings.json` 键结构（值脱敏）**：`permissions.trustDirectories[]`；`security.auth.selectedType`（str）；
`model.{name, preferences.qfmodel.{contextWindow:int, reasoning.effort}}`。
**`state.json` 键**：`tipsShown`、`startupWarningCounts`、`lastLoginMethod`。

## 2 判为独立一家（非 qwen 别名）

登录＝账号制（`.auth/` + `state.json.lastLoginMethod`，官网 email/Google/GitHub），**不是** provider+API key；
原生 root 三处自成一套、与 `@qwen-code/qwen-code` 落点不同 ⇒ 第九家（R-0038）。

## 3 六个部分 → 落地计划（本单余 2–5 部分待后续阶段，勿半拉子）

| # | 部分 | 计划落点（镜像既有家族，如 qwen/hermes） | 依赖/风险 |
| --- | --- | --- | --- |
| 1 | 打包挂载 | 新建 `agent_box_harnesses/qoder/`（`production.py` 模板 + 工件只读投影 + 安装集条目，pin 摘要）；`harnesses.toml` 增一条数据记录（**不改 wire 方法**，G1） | 工件源：qodercli 是否可离线打包待阶段 2 查 |
| 2 | 原生配置物化 | profile → 隔离 home 物化 `settings.json`（permissions/security/model）；**只写声明的文件**；`~/.qoder` 为 native home，另两 root 一并声明（G4） | 运行态目录（tasks/projects/file-history/logs/tmp/session-env/shell-snapshots）**不物化、不同步**（会话/转写按平台，45 语义） |
| 3 | 账号登录 | 按 094/095 账号模型：登录态 `.auth/`（locator 化，内容不进日志/证据）+ `state.json.lastLoginMethod`；写回声明文件、有界、原子 | 无登录 ⇒ 类型化拒（G2） |
| 4 | 跨平台放置 | WSL/local/Windows 三放置可用；沙箱默认随放置（复用 090 语义，不改其码） | — |
| 5 | 门 | 缺席即失败：无登录/无工件 ⇒ 类型化拒绝；反例＝把拒绝改照跑必红（G2/G3） | 真机腿受本环境产物限制则如实 PARTIAL |
| 6 | 未知字段 | 见 §4 | — |

## 4 未知键登记（G5，一手；不猜语义、不静默丢弃）

| 键/项 | 位置 | 状态 |
| --- | --- | --- |
| `security.auth.selectedType` | `~/.qoder/settings.json` | **含义未查实**（疑为登录方式选择）；物化前不解释，标待观测 |
| `model.preferences.qfmodel.{contextWindow,reasoning.effort}` | 同上 | 模型偏好；与 `--thinking`/`--reasoning-effort` 关系**未一手确认**，不编 |
| `state.json.tipsShown` / `startupWarningCounts` | `~/.qoder/state.json` | 判为**应用本地态**，非 profile 记录 ⇒ 不纳入同步（如实记其存在） |
| `~/.qodersec/`（config.yaml/bin/logs/state） | 独立 root | **用途未查实**（CodeSec 安全评审工具）；本单先登记其存在与未知，物化/放置是否纳入待观测 |
| `~/.qoder-cli/ai-stats/` | 独立 root | 提交统计遥测（`verified-<sha>.json`）；判为**非登录/非模型配置**，不纳入 profile 物化；如实记 |
| `installation_id`、`machine_id`（`.auth/`内） | 多处 | 设备身份，**凭据/隐私** ⇒ 只 locator、不读值、不入证据 |

## 5 边界核对（防混同/防越界）

- 不与 qwen 混同（独立 id、独立 root）。不改 092/093 通用机制（本单消费）。不在 `--thinking` 上发明档位（属 096/107）。
- wire 不新增方法（第九家＝目录多一条记录）。凭据纪律：`.auth` 内容、machine_id 零入日志/证据。
- **本阶段只做观测+计划（114 阶段 1）**；打包/物化/登录/放置/门（阶段 2–5）在后续提交逐件落地，未拍/未查实处如实标注，不半拉子。
