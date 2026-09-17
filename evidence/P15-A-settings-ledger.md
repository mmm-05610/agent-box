# P15-A evidence — 设置页剪裁台账（每个 section 一行结论）

工单：[`docs/desktop-product-delivery/work-orders/P15-skill-mcp-hubs-and-settings-prune.md`](../work-orders/P15-skill-mcp-hubs-and-settings-prune.md) 的 **A 阶段**
基线：P14 收口（`45b35bf6`）。执行环境：Windows 隔离树 `C:\Users\maoqh\agentbox-wsl-round1`。

## 1. 台账（判据：与「Server + Profile/Session + 家族 + 资产」语义无关者删除，真删代码与入口）

### 1.1 保留的产品视图（`ACTIVE_SETTINGS_VIEWS`，9 个）

| 视图 | 服务什么产品能力 | 数据来源 | 结论 |
| --- | --- | --- | --- |
| `product:models` | Provider/Model 记录、凭据引用、账号列表 | `providerModels.*`（wire）+ 本机凭据记录 | **保留**（P11/P12 实现） |
| `product:resources` | Skill / MCP 资产库（P15-B/C） | 待后端 58 | **保留（诚实占位）** |
| `product:identities` | 账号与 API key 身份 | 本机凭据记录 + 待 56 | **保留（诚实占位）** |
| `product:harnesses` | Harness 程序目录/版本（P13） | 待后端 57 | **保留（字段清单 + 缺源声明）** |
| `product:data` | 应用备份/恢复 | 待外围合同 | **保留（诚实占位）** |
| `appearance` | 外观、语言、缩放、终端字体（P06 r3 起为 Desktop 本地偏好） | 本机偏好端口 | **保留** |
| `notifications` | 通知种类与焦点行为 | 本机设置 | **保留** |
| `keybinds` | 键位 | 本机设置 | **保留** |
| `about` | 版本与关于 | 本机 | **保留** |

### 1.2 旧的 legacy 入口 → 重定向（保留重定向，不恢复页面）

`billing → product:identities`、`connections → product:harnesses`、`config:appearance → appearance`、
`config:model → product:models`、`gateway → product:harnesses`、`keys → product:identities`、
`mcp → product:resources`、`plugins → product:resources`、`providers → product:identities`、
`sessions → product:data`（`settings-navigation.ts` 的 `LEGACY_SETTINGS_REDIRECTS`）。
**深链不 404**：`resolveSettingsView` 落到产品视图。

### 1.3 删除（45 个生产模块；均为**无任何导入者**的死代码，属旧桌面线的设置页）

| 组 | 模块 | 曾服务 | 结论 |
| --- | --- | --- | --- |
| 计费 | `billing/**`（19 个，含 api/simulated-api/tier-art/plans-view/use-* 等） | Nous 计费墙（入口早已重定向到 identities） | **删除**（真删目录） |
| 网关/SSH | `gateway-settings.tsx`、`gateway-settings-parts.tsx`、`gateway-settings-view.tsx`、`ssh-host-selection.ts` | 旧网关与 SSH 主机选择 | **删除** |
| 模型/密钥 | `model-settings.tsx`、`providers-settings.tsx`、`keys-settings.tsx`、`custom-endpoints-settings.tsx`、`local-models-settings.tsx`、`fallback-models-field.tsx`、`pool-limits-setting.tsx` | 旧 Hermes 模型/供应商/密钥配置（产品面已由 P11 的 wire 记录取代） | **删除** |
| 配置/环境 | `config-settings.tsx`、`config-field.tsx`、`settings-state.ts`、`env-credentials.tsx`、`env-var-actions-menu.tsx`、`settings/test-utils.ts` | 旧配置表单与环境变量凭据 | **删除** |
| 记忆/MCP | `memory/connect.tsx`、`memory/field-control.tsx`、`memory/provider-config-modal.tsx`、`memory/provider-config-panel.tsx` | 旧记忆 provider 面板（产品面归 58） | **删除** |
| 其它 | `connections-registry.tsx`、`managed-updates-section.tsx`、`quick-entry-settings.tsx`、`plugins-settings.tsx`、`sessions-settings.tsx`、`profile-scope.tsx`、`searchable-select.tsx`、`with-active.tsx` | 旧插件/会话/快速入口设置 | **删除** |

删除后**新增孤儿**（只被上述模块引用）一并删除：`features/settings/credential-key-ui.tsx`、
`store/settings-scope.ts(.test.ts)`、`store/managed-updates.ts(.test.ts)`、`store/data-url-read-max.ts(.test.ts)`、
`store/disable-f12.ts`、`store/keep-awake.ts(.test.ts)`。

`settings-search.ts` 剪裁：只保留 **appearance** 所需的 `APPEARANCE_SETTING_IDS` + 路由序列化
（`settingsSearchTargetQuery`）；删除 config/credential 搜索条目构建器（其目标页面已删除）。
其测试 `settings-search.test.ts` 随之删除。

删除的测试（共 19+7+1 = 27 个文件）：随死模块走的 19 个（billing 10、connections-registry、gateway-settings×2、
keys-settings、local-models-settings、plugins-settings、searchable-select、ssh-host-selection、with-active）、
主体已删的 7 个（config-settings、fallback-models-field、memory/provider-config-modal、
memory/provider-config-panel、model-settings、profile-scope、providers-settings）、以及 settings-search.test.ts。

### 1.4 保留但被贴近检查的对象（**不删**）

- `plugin-install-modal.tsx`：产品组合（`app/composition/wiring/features.tsx`）在用；其测试改为**只挂载该组件**
  并由请求 store 直接开门（原来靠已删的 plugins 页面点击进入）。
- `browser-real-profile-panel.tsx`、`computer-use-panel.tsx`、`terminal-backend-panel.tsx`、
  `toolset-config-panel.tsx`：被 `features/skills` / `features/chat/right-rail` / `host-views` 引用（P15-B/C 的面）。
- `use-settings-search.ts`：命令面板在用（只搜 appearance，文件头已写明为何不搜 legacy）。

## 2. 门

| 门 | 结论 |
| --- | --- |
| **G1 台账齐全** | **达成**：9 个产品视图 + 10 个重定向 + 45 个删除模块 + 6 个新增孤儿，逐项给出「服务什么/数据来源/结论」 |
| **G2 删除项不存在且无孤儿引用** | **达成**：删除均经**导入图**判定（`from`/`import()`/`import '…'`/`require()` 四种写法全覆盖，测试也算导入者）；删除后 `tsc -p . --noEmit` exit 0 且全量 UI 套件通过；对「只被删模块引用的 store」做了一次模块级孤儿复查，清掉 6 个新孤儿（含其死测试） |
| **G3 保留项既有用例不退化** | 见 status 行的全量结果；本轮只有 5 处**文案断言**随 P14-D 的新文案同步更新，外加 2 个测试随主体删除而删除、1 个（plugin-install-modal）改为直接挂载组件 |

## 3. 未做项（不冒充）

- P15-B（Skill Hub）与 P15-C（MCP Hub）需要**后端 58**（资产库、物化、绑定、探测）；当前 wire 没有对应方法，
  故仍是诚实占位页（`product:resources`），本单 A 阶段只做剪裁。
- 删除后仍未动的既有死模块（如 `features/starmap`、`features/webhooks`、`features/cron`、
  `features/chat/sidebar/cron-jobs-section.tsx`、`profile-switcher.tsx` 等）**不属于设置页剪裁范围**，
  它们各自属于别的单/别的面；本轮**未**顺手删除（避免把无关面卷进来），已在 §1.4 之外单列。
