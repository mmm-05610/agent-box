# Batch 27 — three form widgets leave the settings page for `components/`

**Edges paid off: 0.** 账本前后都是 **0**。

## 为什么是这一批

`app/settings/` 有 20,420 行，但它不是一坨。按"提到 hermes 的次数"分开数过之后，
里面有一格是**跟 hermes 毫无关系的通用表单件**，却住在设置页的目录里：

| 文件 | 行数 | 提到 hermes | 它 import 什么 |
| --- | --- | --- | --- |
| `app/settings/primitives.tsx` | 266 | **0 次** | `@/components/ui/{badge,button,skeleton,switch}` · `@/lib/{haptics,icons,layout-constants,utils}` |
| `app/settings/combobox-input.tsx` | 114 | **0 次** | `@/components/ui/{codicon,command,input,popover}` · `@/lib/utils` |
| `app/settings/searchable-select.tsx` | 115 | **0 次** | `@/components/ui/{codicon,command,control,popover}` · `@/lib/utils` |

**三个文件 / 495 行，零 hermes 依赖，而且它们够着的最高层就是 `components/ui/`（rank 4，即目的地本身）。**

而 `primitives.tsx` 已经不只服务设置页了——`app/messaging/index.tsx` 和
`app/webhooks/index.tsx` 也在用它。**一个被三个页面用的组件住在其中一个页面的目录里，这本身就是它该走的理由。**

## 移动清单 → `components/settings/`（basename 不变）

```
app/settings/primitives.tsx          → components/settings/primitives.tsx
app/settings/combobox-input.tsx      → components/settings/combobox-input.tsx
app/settings/searchable-select.tsx   → components/settings/searchable-select.tsx
```

**3 个文件 / 495 行。** 导出名字一个都不改。

## 证据

```
群 3 个文件 → 目标 rank 4
  组外闭包 16 个模块 · 外部包: react
  ✓ 干净：组外没有任何高于目标层的东西
```

`app/`（rank 5）import `components/`（rank 4）是**下行，合法**；
`components/` 内部互相同 rank，也合法。所以这次搬运在方向上是安全的。

## 要改的引用

`primitives.tsx` 的消费者最多（含两个**不在设置页**的页面）：

```
app/messaging/index.tsx
app/webhooks/index.tsx
app/settings/{env-credentials,appearance-settings,uninstall-section,pet-settings,
              computer-use-panel,managed-updates-section,keybind-settings,
              providers-settings,config-field,plugins-settings}.tsx
```

`combobox-input` 与 `searchable-select` 各只有一个消费者：`app/settings/config-field.tsx`。

```bash
cd apps/desktop/src
rg -n "'\./(primitives|combobox-input|searchable-select)'|settings/(primitives|combobox-input|searchable-select)"
```

**五种写法都要覆盖**（`from`、`import()`、`require()`、`vi.mock()`、副作用 `import '…'`），
**测试文件也要覆盖**。

## 目的地为什么是 `components/settings/`，而不是 `components/ui/`

`combobox-input.tsx` 和 `searchable-select.tsx` 论性质是通用输入控件，放 `components/ui/`
也说得过去。选 `components/settings/` 的理由只有一条：**三个文件一起走，一个目的地，执行者不需要做判断。**
把它们拆去两个目录，就是在派工单里塞进一个本可以留到以后的决定。

`components/settings/` 目前不存在，本批新建。

**记录一个已知的别扭之处，不要在本批解决**：`primitives.tsx` 里的 `ListRow`、`ToggleRow`、
`Pill`、`NavLink` 是通用的，而 `SettingsContent`、`SettingsSection`、`SettingsSkeleton` 是设置页专用的。
**一个文件里混着两种**——如果哪天这个别扭开始咬人，切口是现成的（通用的去 `components/ui/`，
设置专用的留下）。**本批不切**，理由和 batch 26 一样：今天没有人只要其中一半。

## 不做的事

- **不搬 `config-field.tsx`（238 行）。** 它 import 了 `@/types/hermes` 的 `ConfigFieldSchema`、
  `./constants`、`./fallback-models-field`——**它是被 hermes 的配置 schema 绑住的**，
  不是通用件。它留在 `app/settings/`，等 Extension 机制。
- **不搬 `app/settings/` 的任何面板**（gateway / model / local-models / connections /
  appearance / toolset / providers / billing / memory）。那是 hermes 产品面，归宿是 Extension。
- **不切 `primitives.tsx`**（见上）。
- **不改任何函数体、不改导出名。**

## 验证

```bash
cd apps/desktop
npm run typecheck && npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers && npm run test:ui
```

基线：**776 文件 / 7466 个**；守卫 **16/16**；账本 **0**（前后都是 0）。

`app/settings/` 下的测试跟着被测文件走；**断言不许改**。

## 停止条件

- **三个文件里任何一个需要 `app/` 或 `@/types/hermes` 的东西。** 表是量出来的——
  零 hermes 依赖是这三个文件**被选中的唯一理由**。真出现就是量错了，报告，不许加 shim。
- **`primitives.tsx` 的某个消费者在 `components/` 下。** 那会让 `components → components` 的
  引用变成另一回事；报告，别自己判断。
- **新建的 `components/settings/` 里出现 `@/app/` 的 import。** 那就是方向反了，停下来。
- **测试需要改断言。**
- 不要读、改、stage `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。
