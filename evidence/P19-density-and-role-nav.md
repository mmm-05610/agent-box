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
