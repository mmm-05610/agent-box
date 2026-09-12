# Batch 18 — starmap 的纯数学搬进 `lib/`

**Edges paid off: 0.** 本批不还账；账本前后都必须是 **0**。

## 为什么是这一批

`app/starmap/` 是一个**自足的子树**：13 个文件里有 9 个不含 React、不渲染任何东西——
力导向模拟、坐标几何、颜色插值、时间轴、分享码编解码、canvas 绘制。它们住在 rank 5 的唯一
理由是**同目录还有 4 个 `.tsx`**。

> `render.ts` 865 行是**整轮扫描里单个最大的可下沉文件**。它一行 React 都没有。

搬完之后 `app/starmap/` 只剩界面，`lib/starmap/` 是可以单测的纯数学。

## 移动清单

全部搬进 `lib/starmap/`，basename 不变：

| 从 `app/starmap/` | 行数 |
| --- | --- |
| `types.ts` | 98 |
| `constants.ts` | 63 |
| `geometry.ts` | 133 |
| `color.ts` | 139 |
| `text.ts` | 91 |
| `time-axis.ts` | 106 |
| `share-code.ts` | 189 |
| `simulation.ts` | 299 |
| `render.ts` | 865 |

**9 个文件 / 1983 行。** 留在原地的只有 4 个 `.tsx`：`index.tsx`、`star-map.tsx`、
`timeline.tsx`、`node-context-menu.tsx`（外加 `share-controls.tsx`，如果它在）。

## 证据：整组移动后组外闭包是干净的

按整组算（不是逐文件），组外闭包只有 **4 个模块**，全部 rank 0 或以下，
唯一的外部包是 `d3-force`：

```
群 9 个文件 → 目标 rank 0
  组外闭包 4 个模块 · 外部包: d3-force
  ✓ 干净：组外没有任何高于目标层的东西
```

逐文件算会骗人：`color.ts` 单独看会报"拖 rank5"，而那个 rank5 是它同目录的
`types.ts` / `geometry.ts` / `constants.ts`——**必然同行的兄弟不是阻塞**。
先按组算，再定批次。

## 要改的引用

搬完之后，留在 `app/starmap/` 的 4 个 `.tsx` 从 `@/lib/starmap/...` 导入。
`app/starmap/` 之外目前**没有**生产导入者——但不要相信这句话，自己重算：

```bash
cd apps/desktop/src
rg -n "app/starmap|@/app/starmap|starmap/" --glob '!app/starmap/*'
```

注意 barrel 的写法：`@/app/starmap`（没有结尾斜杠）不会被 `starmap/` 这个模式命中。
**五种写法都要覆盖**：`from`、`import()`、`require()`、`vi.mock()`、副作用 `import '…'`。
（starmap 页面是按路由懒挂的，`import()` 这条尤其要看。）

## 不做的事

- **不搬 `app/starmap/` 里的 `.tsx`。** 它们是界面。
- **不动 `store/starmap.ts`。** 那是 store，本来就在 rank 1，不是本批的范围。
- **不顺手改渲染逻辑或去掉 `d3-force`。** 这是搬运，行为一个字都不许变。

## 验证

```bash
cd apps/desktop
npm run typecheck
npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers
npm run test:ui
```

基线：测试 **776 文件 / 7466 个**；守卫 **16/16**；账本 **0**（前后都是 0）。

starmap 自己有测试（`app/starmap/*.test.ts`）。**测试跟着被测模块走**——
哪个测试测的是搬走的那 9 件，就一起搬进 `lib/starmap/`；测 `.tsx` 的留下。
如果搬完发现某个测试的断言变了，那不是搬运，停下来报告。

## 停止条件

- **搬走的文件需要 `app/` 或 `components/` 里的任何东西。** 闭包说不需要。
  真出现就报告符号，**不许加转发 shim**。
- **`lib/starmap/` 里出现跨文件的循环导入。** 现在这 9 件互相依赖是单向的；
  如果搬完出现环，说明原本就有环，停下来报告，不要顺手重构。
- **某个 `.tsx` 需要从 `lib/starmap/` 反向要一个只在渲染里成立的类型。**
  那说明那个类型该留在 `app/starmap/types.ts` 或上提到 `types/`——报告，不要就地塞进 `lib/`。
- 不要读、改、stage `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。
