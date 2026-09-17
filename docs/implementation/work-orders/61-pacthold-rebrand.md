# Work Order 61 — Pacthold 品牌落地（基础设施侧）

状态：**QUEUED**（2026-09-16 用户裁定：路线 (a)——**排到当前队列之后**，改名不着急）。
依赖：**60 完成之后**（同一工作树串行；改名要动的 README / pyproject / CLI / src 与 44–60 的写集重叠）。
配对单：桌面工作树 **P18（Ordessa）**——两仓的**名称映射必须一致**。
不紧急：**不得**插队、不得打断 44–60。

## §0 目标与完成标准

把 `agent-box` 仓落成 **Pacthold**（执行治理基础设施）：展示文案、CLI 入口、可验证的构建元数据、文档。
**完成标准不是"搜不到旧词"**，而是：
**用户看到的是 Pacthold；开发者接入的是 Pacthold；存量配置与跨组件契约没有被改名意外破坏。**

品牌关系：**Ordessa, powered by Pacthold.**（Ordessa 是桌面应用；Pacthold 是它消费的基础设施）
组件级说法：Pacthold Core / Pacthold Server / Pacthold Worker / Pacthold SDK。
中文名（执契/掌序）**仅作候选记录**，不进路径/安装名/环境变量。

## §1 审计（2026-09-16 本单撰写时第一手，执行时复核）

- 命中文件数：`agent-box` **340** / `agent_box` **337** / `Agent-Box` **134** / `AgentBox` **103** /
  `AGENTBOX` **48** / `Hermes Desktop` **1**。
- 集中区：`tests/**` 24、**归档 63**（`docs/validation/archive` 23、`docs/research/archive` 21、
  `docs/specs/archive` 19）、`scripts/server-round1` 18、插件 tests 17、证据文档 15、工单 15。
- **CLI 入口（`pyproject.toml` 的 `[project.scripts]`）**：
  `agent-box` → `agent_box.cli:main`；`agent-box-server` → `agent_box.server.__main__:main`；
  `agent-box-server-credential` → `agent_box.server.credential_cli:main`。
- **分离层**：`agent_box`（Python import 路径 / entry-point group）与"品牌"**不是同一层**——
  本单**不强制**改 import 路径（spec §5.3 同结论）。

## §2 分类原则（四类，逐类给处理）

| 类型 | 例子 | 处理 |
| --- | --- | --- |
| 自有品牌展示 | README（中英）、简介、CLI `--help`、版本展示、服务/插件展示名、安装与开发指南 | **改**成 Pacthold；组件级用 Pacthold Server/Worker/SDK |
| 代码与构建引用 | 包名、CLI 脚本名、构建脚本、资源路径 | **成组改并验证**（生产者与消费者一起看） |
| **兼容性敏感标识** | `agent_box.plugins`（entry-point group）、`agent-box.*@1`（合同 ID）、`wire/1`、
  `AGENTBOX_*` 环境变量、数据目录、DB 路径、IPC channel、`secrets/http-token` | **不动**；新名只作**别名**并测优先级（新名优先、旧名回退） |
| 历史/第三方 | `docs/*/archive/**`、上游 LICENSE/NOTICE、真实 Harness 名（Hermes 等）、旧协议样例 | **保留**，只在审计结果里说明 |

## §3 要做的事

- **A 映射与保留清单**（先做）：把 §1 的命中分成四类，产出**新旧名称映射表** + **兼容保留清单**
  （每一项写"为什么必须保留"），落在 `docs/branding/REBRANDING_REPORT.md`（与 P18 同一格式）。
- **B 文案与展示**：当前有效的 README（含中文 README）、项目简介、CLI 帮助、版本展示、服务与插件展示名、
  安装/开发指南；历史与归档**不改写**，新增一条**品牌迁移说明**。
- **C CLI**：新增 `pacthold` / `pacthold-server` / `pacthold-server-credential`，**复用同一实现**；
  **旧三条保留为别名**（参数与行为不变）。**先核实实际入口存在再改**，不为改名造不存在的功能。
- **D 包与构建元数据**：能在本地完整验证的（构建元数据、内部依赖、wheelhouse、版本查询、安装脚本）
  一并迁移；**已公开发布包只列兼容说明、不实际发布**；README **不得**展示尚未发布、装不上的 PyPI 命令。
- **E 跨仓边界**：检查 Desktop 的**服务发现、启动脚本与测试夹具**对命令名的依赖——
  **别出现"后端能起、Desktop 找不到服务"**。Windows 手动启动脚本（`run-ui-manual.ps1`）依赖旧命令名，
  **别名保留即无需改动**（若不保留别名，必须同步改脚本并在报告里列出）。
- **F 领域模型不动**：不因品牌改名重命名或重定义 Work / Execution / Binding / Dispatch / Ref / Evidence，
  不改幂等语义、派发不确定态、事实记录、原子收尾与 Provider 的原生状态所有权。

## §4 硬门（违反即返工）

1. **合同零变化**：`wire/1`、28 方法、TS 摘要 `7746404984…`、生成工件 `14f7f736…` **逐字节不变**；
   `agent-box.*@1`、`agent_box.plugins`、`AGENTBOX_*`、数据目录、`secrets/http-token` **一个都不改**。
2. **改完必须真跑**：全量套件 + **一次真实启动冒烟**（**用新 CLI** 起 Server、Desktop 连上、跑一轮 no-model，
   证明服务发现没被改坏）。
3. **归档不改写**；**Hermes 作为真实 harness 名与上游版权/NOTICE 全部保留**。
4. **不 push、不改远端仓库名、不发版、不跑付费模型**。
5. 不为通过检查而删测试、放宽校验或批量重录快照；**区分原有失败与本次引入的失败**。

## §5 六件套 DoD 与报告

实现 / 定向测试（新 CLI 可用 + 旧别名行为一致 + 环境变量别名优先级）/ 真机冒烟证据 /
回归计数 / status 分账 / 清理证据。
报告含：实际仓库与分支、修改范围、**新旧名称映射表**、**兼容保留项及原因**、执行过的验证与结果、
未完成项（发布/数据迁移/Logo/远端改名）；并明确 **P18 与本章节的映射一致**。

## §6 边界

- **Logo 已就绪（2026-09-17 用户提供设计稿）**：资产包在 `/home/maoqh/projects/agent-box-brand/`
  （见其 `KIT.md`：mark SVG/PNG、图标集 16–1024、ICO/ICNS、favicon.svg、字标、锁版）。
  **放置**：`plugins/agent-box-web/src/agent_box_web/_static/favicon.svg` ← `pacthold/icon/pacthold-favicon.svg`；
  README（当前无图）可加 `pacthold/lockup/pacthold-lockup.png` 作 banner。
  **保留**：`_static/logos/**`（claude/openai/hermes/opencode 等**第三方真实标识**）与
  `frontend/src/icons/extracted/**` —— 那是别家商标，不是我们的品牌。
  **保真**：mark 的 SVG 是**自动描摹**（源约 200px），字标是文本栅格（未放大）；
  正式发布建议向设计方索取原始矢量与字体信息；
- **不做**：发布、远端改名、域名、数据迁移、付费调用、架构重写；
- **不做**：`agent_box` import 路径的强制改名（保留为独立决策）；
- 快照仓库（`workcore-naming-snapshot`）**不碰**。
