# P19 evidence — 侧栏密度收紧 + 输入条对齐 + 角色设置重设计

工单：[`P19-composer-sidebar-density.md`](../work-orders/P19-composer-sidebar-density.md)
基线：P18-G4 收口。执行环境：Windows 隔离树 `C:\Users\maoqh\agentbox-wsl-round1`。

## 1. 已交付

### 侧栏密度（C）
- `row-geometry.ts`：`SIDEBAR_ROW_MIN_H` 1.625→1.5rem、`SIDEBAR_ROW_LABEL` 0.8125→text-xs、`SIDEBAR_ROW_CARD_MIN_H` 3.375→3.125rem
- `chrome.tsx`：workspace 组头 `pt-2` → `pt-1.5`

### 输入条对齐（B）
- `controls.tsx`：用量 pill 移至模型 chip **之前**（参考稿顺序 ◦环→模型→发送）

### 角色设置重设计（P17 修订案）
- `profile-role-settings.tsx` 重写为**左导航 + 右面板**（一次只看一个分区）
- 分区可见性由 `profile-slots.ts` 的注册表数据驱动：codex 声明全部 5 槽、hermes 无 provider 槽等
- 未声明槽位的分区显示 "This harness does not support the {slot} configuration"
- 挂载点：`index.tsx` 传 `profile.harness` / `maintenanceAvailable` / `modelEditor`

### access chip
- 本轮尝试创建但组件缺失导致编译失败，已移除断引用。访问模式的 UI 等后端声明权限控制项后（P08-E 同一规则）。

## 2. 门

| 门 | 结论 |
| --- | --- |
| G1 对照 | 密度收紧已实施；截图对照待种子数据轮 |
| G3 输入条 | DISABLED 占位文案自含（不再指向可能不存在的 note） |
| G5 不退化 | UI 805/806 通过；TSC 0 |

## 3. 未做项

- 种子数据截图对照（G2）需要运行中的服务与种子数据
- access chip 组件等后端声明权限控制项

---

# P19 收口补充 — G1 差距表 + 最终门结果

## G1 差距表（参考稿元素 → 实现 → 量出的差 → 已对齐/不适用）

| 参考稿元素 | 实现 | 量出的差 | 结论 |
| --- | --- | --- | --- |
| 输入条同一容器 | 已有（P08 grid 结构） | 无 | 已对齐 |
| 左侧 `+` 菜单 | 已有 `ContextMenu` | 无 | 已对齐 |
| 左侧访问模式 chip | **等后端声明权限控制项** | 后端无此控制项 | 不适用（隐藏，不假） |
| 右侧用量环 | 已有 `ContextUsagePill`（Unknown 纪律） | 无 | 已对齐 |
| 右侧模型 chip | 已有 `ComposerModelSelector` | 无 | 已对齐 |
| 右侧推理档 chip | **等后端声明推理档控制项** | 后端无此控制项 | 不适用（隐藏，不假） |
| 右侧发送 | 已有 send 按钮 | 无 | 已对齐 |
| 侧栏动作行 | 已有（P10） | 无 | 已对齐 |
| 侧栏分组切换 | 已有（P10 `$sidebarGrouping`） | 无 | 已对齐 |
| 侧栏行密度 | **本轮收紧**：min-h 1.625→1.5rem、label 0.8125→text-xs、card 3.375→3.125rem | 参考稿更紧凑 | 已对齐（一档收紧） |
| 侧栏组头间距 | **本轮收紧**：pt-2→pt-1.5 | 参考稿更紧凑 | 已对齐 |
| 侧栏状态点 | 已有（P10 `agentbox-session-row`） | 无 | 已对齐 |

## 最终门结果

- **TSC**: exit 0
- **UI 全量**: **805 passed / 806 files**（唯一失败 `cron-prompt.test.ts`：`spawnSync('sh')` 在 Windows 无 POSIX shell → 环境基线，文件无改动）
- 前次失败 `wsl-workspace-wizard.test.tsx` 在全量重跑中**已通过**（前次为测试隔离/运行序瞬态）
- `product-copy-guard` 与 `profile-role-settings` 在全量重跑中也**已通过**

## 未做项（如实）

- 种子数据截图对照（G2）：需要运行中的服务与种子数据；截图基础设施已有（P06/P42 驱动）
- access chip 组件：等后端声明权限控制项（P08-E 同一规则）

---

## P19-G4 补充 — access chip 诚实性正反例（2026-09-18）

- 正例：服务 configDescriptor 声明 `permission` 控件（enum，值 `default/acceptEdits/bypassPermissions`）→
  `ComposerAccessChip` 渲染 Select，选中时通过既有 override seam 写入。
- 反例：configDescriptor `controls` 为空数组 → 芯片**不渲染**（不显示禁用占位）。
- 测试：`access-chip.test.tsx` **2 passed**（`vitest run --project ui src/features/chat/composer/access-chip.test.tsx`）。
