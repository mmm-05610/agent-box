# P17 evidence — Profile 设置面（绑定点 / 权限规则 / 指令 / 资产 / 克隆 / 会话归属）

工单：[`docs/desktop-product-delivery/work-orders/P17-profile-settings.md`](../work-orders/P17-profile-settings.md)
配对后端单 **60**。基线：P16 收口（`6a9c580f`）。执行环境：Windows 隔离树 `C:\Users\maoqh\agentbox-wsl-round1`。

## 本单最重要的一条：session 不属于任何 profile

这句话在客户端可以**独立完成并锁定**，所以本阶段先把它做实：

1. **文案纠正**：`profiles.remoteOverride.description` 由「**Sessions in this profile** will run on the remote …」
   改为「Sessions **opened while this profile is bound** will run on …」——绑定而非拥有。
2. **界面陈述**：角色详情页新增 `data-session-ownership` 段落：
   「会话属于**工作区**；角色被绑定到一次对话，但不拥有它；更换绑定是**会话上的动作**，历史保留，
   每一轮记录当时用的角色与版本。」
3. **守卫**：`product-copy-guard.test.ts` 新增 **ownership 规则**——六语言全量扫描三类句式
   （`sessions of/in this role|profile`、`this role's sessions`、以及中日阿俄的「该角色的会话」式），
   并带**非空对照**（`Sessions belong to a workspace` 不得命中）。G6 的「查询」一半属后端 60 的归属纠正，
   见「未做项」。

## 其余部分（需要后端 60 的字段）

角色详情页新增 `ProfileRoleSettings`（`data-role-settings`），把三组**决定**先写清楚，**零可点控件**（P16 纪律）：

| 分区 | 内容 |
| --- | --- |
| 角色将承载什么（`data-role-zones`） | 指令 / 模型槽 / 凭据或账号引用 / 技能·MCP·hook 勾选 / 权限规则 / 高级运行上限；并注明「编辑能力随拥有这些记录的服务一起到来，在此之前不显示无法保存的控件」 |
| 会话归属（`data-session-ownership`） | 见上 |
| 权限规则的运作方式（`data-permission-model`） | 每工具键一行（read/edit/bash/task/external_directory/webfetch/skill…）取值 ask\|allow\|deny + glob；**最后匹配的规则生效**；预设一次性填表且**逐项仍可覆盖**（覆盖行显示为已自定义）；**ask = 我们的审批往返**（执行时暂停询问） |
| 更换绑定与克隆（`data-rebind-consequences`） | 同家族允许：文件式 journal 家族「原生会话跟着搬」／共享 DB 家族「原生连续性重新开始」，提示**出现在操作之前**；换家族**只提供克隆**，克隆界面列可迁移/不可迁移；**session 类资产不迁移**、克隆**不继承旧原生会话** |

## 门

| 门 | 结论 |
| --- | --- |
| **G1 六区齐全且都能改** | **部分**：六区**齐全**并逐条列出；「都能改」需 60 的记录扩展 → 本阶段**不显示**不可保存的控件（如实标注，不假装可改） |
| **G2 不支持项明说** | **成立（当前形态）**：`zonesPending` 明说编辑等 60；无死控件 |
| **G3 改完下一轮生效有第一手证据** | **不适用**：没有可提交的编辑（同 P11 G6 的按轮物化结论已在 `provider-switch-hot.test.ts` 证明客户端半） |
| **G4 规则求值可预期（最后匹配生效）** | **不适用**：求解在后端 60；界面已把「最后匹配生效」写成规则 |
| **G5 不得放开该家没有的能力** | **不适用**：无放开的入口；规则文本写明后端的收紧会如实反映 |
| **G6 文案与查询都不体现 profile 拥有 session** | **文案半成立**：ownership 守卫 + 界面陈述（用例锁定）；**查询半待 60** |
| **G7 历史每轮归属可见** | **不适用**：需要 60 的按轮归属字段 |
| **G8 两种换绑定后果在操作前可见** | **不适用**：操作本身待 60；两种后果的**文案已在操作前位置就位** |
| **G9 克隆后不显示「已继承旧会话」** | **不适用**：无克隆动作；但「不继承旧原生会话」已写成硬规则并由用例锁定 |

## 测试与命令

- 新增 5 例（`profile-role-settings.test.tsx`）：归属陈述、六区齐全 + 编辑等 60、权限模型三条、
  换绑与克隆后果四条、**零控件**。
- 守卫新增 2 例（ownership 规则 + 非空对照）。
- `vitest run --project ui src/features/profiles src/features/settings src/i18n src/dev/contracts`
  → **36 files / 338 tests passed，exit 0**；`tsc -p . --noEmit` exit 0。
- 首轮失败与修复：`types.ts` 插入丢换行（TS1005）当场修复；`ar.ts` 一处混入中文的句子已改正。

## 未做项（不冒充）

- **等后端 60**：记录扩展（六区字段）、权限求解（glob + 最后匹配 + 预设与覆盖状态）、**归属纠正的查询半**、
  按轮归属历史、克隆与换绑定的连续性分档。届时在同一位置接真值并补 G1/G3–G9 的真实用例。
- **不做**子代理、wire 变更、就地换家族（产品决定：只能克隆）。
