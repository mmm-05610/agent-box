# Pacthold 品牌落地报告（工单 61，基础设施侧）

执行：2026-09-18，`agent-box-env-provider` 工作树（分支 `feature/env-provider-v1`）。
配对本：桌面工作树 **P18（Ordessa）**——两仓名称映射以本表为准。

## 1. 审计（本工作树一手复核，2026-09-18）

| 模式 | 命中文件数 | 备注 |
| --- | --- | --- |
| `agent-box` | 382 | 含归档 81（`docs/*/archive/**`）与历史 CHANGELOG |
| `agent_box` | 403 | Python import 路径 / entry-point group（**兼容敏感，不动**） |
| `Agent-Box` | 136 | 展示文案与文档 |
| `AgentBox` | 113 | 展示文案与文档 |
| `AGENTBOX` | 70 | 环境变量前缀（**兼容敏感，不动**） |
| `Hermes Desktop` | 2 | 历史称呼，仅保留说明 |

分布（`agent-box|agent_box`）：src 67、plugins 154、tests 68、scripts 31、docs 206、workers 4。

## 2. 四类处理表

| 类型 | 本项目实例 | 处理 |
| --- | --- | --- |
| **自有品牌展示** | README.md / README_CN.md 标题与正文、项目描述、CLI `--help` 文案中的产品称呼、品牌迁移说明 | **改**：产品名 **Pacthold**，组件名 Pacthold Core / Server / Worker / SDK |
| **代码与构建引用** | `pyproject.toml` 的 `[project] name`（`agent-box-cli`→**`pacthold`**）、三条新 CLI 脚本名、`agent_box/__init__.py` 的版本查询、插件依赖声明、CLI 提示串 | **成组改并验证**（生产者与消费者同批：见 §3） |
| **兼容性敏感标识** | `agent_box.plugins` entry-point group、`agent-box.*@1` 合同 ID、`wire/1`、`AGENTBOX_*` 环境变量、数据目录/DB 路径、`secrets/http-token`、`agent_box` import 路径 | **不动**；旧 CLI 脚本名保留为**别名**（新名优先，参数与行为不变） |
| **历史/第三方** | `docs/*/archive/**`（81 文件）、CHANGELOG 历史条目、上游 LICENSE/NOTICE、真实 Harness 名（Hermes/Codex/Claude/OpenCode…）、第三方 logo（`_static/logos/**`、`frontend/src/icons/extracted/**`） | **保留**，不改写 |

## 3. 新旧名称映射表（本期实际执行）

| 面 | 旧 | 新 | 兼容策略 |
| --- | --- | --- | --- |
| 分发名 | `agent-box-cli` | **`pacthold`** | 本地构建可验证；旧安装的版本查询回退（`__init__.py` 先问 `pacthold`，再问 `agent-box-cli`） |
| CLI：主入口 | `agent-box` | **`pacthold`** | 旧名保留为别名，同一实现（`agent_box.cli:main`） |
| CLI：服务 | `agent-box-server` | **`pacthold-server`** | 同上（`agent_box.server.__main__:main`） |
| CLI：凭据 | `agent-box-server-credential` | **`pacthold-server-credential`** | 同上（`agent_box.server.credential_cli:main`） |
| 产品称呼（展示） | Agent-Box / AgentBox | **Pacthold** | 只改当前有效文档与界面文案 |

**插件分发名（`agent-box-web` 等）本期不改**：它们是独立分发的包，且被工作树之外的消费者引用
（主仓、wheelhouse、装机脚本）；按 §0 的"不意外破坏"要求，留作**后续单**并在 §6 列出。

## 4. 兼容保留清单（逐项原因）

| 保留项 | 为什么必须保留 |
| --- | --- |
| `agent_box` import 路径与 `agent_box.plugins` entry-point group | 已安装插件按此发现；改名会静默丢掉全部插件（工单 §6 亦明确不做） |
| `agent-box.*@1` 合同 ID / `wire/1` | 跨进程与前端契约，改名=破坏协议 |
| `AGENTBOX_*` 环境变量（含 `AGENT_BOX_*`） | 存量部署与门脚本依赖；新名只作别名并测优先级 |
| 数据目录 / `secrets/http-token` | 存量数据的位置事实；改名=数据"消失" |
| 旧三条 CLI 脚本名 | `run-ui-manual.ps1` 等服务发现路径依赖（别名保留即无需改脚本） |
| 归档与 CHANGELOG 历史 | 历史不重写（工单硬门 3） |
| 第三方 logo 与真实 Harness 名 | 别家商标与产品事实，不属本品牌 |
| `workcore-naming-snapshot` 仓库 | 工单 §6 明确不碰 |

## 5. 执行与验证（已完成，第一手证据）

- **构建元数据（本地 wheel 验证）**：`pip wheel .` 产出
  `pacthold-2.0.0a1-py3-none-any.whl`；`METADATA` 含 `Name: pacthold`、
  `Summary: Pacthold: execution governance kernel …`；`entry_points.txt` 同时含
  **六条** console_scripts（`pacthold`/`pacthold-server`/`pacthold-server-credential` 与
  三条 `agent-box*` 别名），每条新旧对**指向同一 main**。
- **CLI 实跑（venv 安装 wheel）**：`pacthold --version` 与 `agent-box --version` 都输出
  `pacthold 2.0.0a1`（显示名=产品名，别名仍可用）。
- **真机启动冒烟（服务发现）**：用**新名** `pacthold-server --data-root … --port …` 起服务 →
  `GET /api/v1/readiness` = `{"service":"ready","storage":"ready","worker_protocol":"1"}`
  （blockers 为 venv 冒烟环境未装沙箱插件的**预期**项，与服务发现无关）；带 token 的
  `POST /wire/v1/server.hello` 返回 `protocolVersion: "wire/1"` 与能力表 ⇒
  "后端能起、发现面没坏"。
- **契约零变化**：本期改动只落在 `pyproject.toml`（name/description/scripts）、
  `__init__.py`（显示与版本查询回退）、`work_core/runtime.py`（`DISPLAY_NAME`）、
  README×2、插件依赖声明、CLI 两处提示串、品牌资产；**未触碰** §4 清单任何一项；
  新增边界测试钉住：入口对同源、版本回退、`agent_box.plugins`/`wire/1`/`agent-box.skill@1`/
  `AGENTBOX_*` 原样。
- **品牌资产**：`pacthold-favicon.svg` 已放置到
  `plugins/agent-box-web/src/agent_box_web/_static/favicon.svg`（替换旧文件；静态测试只要求
  该文件存在，不钉内容），README×2 顶部加 `pacthold-lockup.png` banner（副本入
  `docs/branding/`）；第三方 logos 与 `frontend/src/icons/extracted/**` **未动**。
- **回归**：全量计数见提交记录（status 分账同批）。

## 6. 未完成项（如实）

1. **插件分发名**（`agent-box-web`/`-git`/`-harnesses`/… → `pacthold-*`）未改：跨仓消费者多，需单开一单
   并逐仓同步（工单 §2 的"成组改并验证"要求以仓库为单位成批进行）；
2. **发布**：不改远端仓库名、不发版、不迁数据（工单 §6）；
3. **Logo 保真**：mark 为自动描摹、字标为文本栅格，正式发布前应向设计方索取原始矢量与字体（KIT.md 说明）；
4. **P18 一致性**：本表为两仓共同基准；P18 侧落在桌面工作树，本工作树不代改。
5. **产品称呼的深水区**：`src/` 内仍有历史性字符串（如 CLI 提示中的包名），逐条按 §2 分类处理完的以 §3 表
   为准；未列入 §3 的命中（归档/历史）按 §4 保留。
