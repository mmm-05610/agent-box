# Batch 26 — the tool card's view model gets an honest name and leaves `components/`

**Edges paid off: 0.** 账本前后都是 **0**。

## 为什么是这一批

`components/assistant-ui/tool/fallback-model/` 这个名字**只描述了它十个消费者里的一个**。
`fallback` 在这里的意思是"没注册专属渲染器的工具用哪张通用卡"，但实际**每一张工具卡都在用它**。

而且这个目录**整族 rank 0 干净**——四个文件的组外闭包 24 个模块，没有任何一个高于 rank 0：

```
群 4 个文件 → 目标 rank 0
  组外闭包 24 个模块
  ✓ 干净：组外没有任何高于目标层的东西
```

`index.ts` 只 import `@/i18n`、`@/lib/{external-link,summarize-command,text,tool-render-class,tool-result-summary}`
和它自己的三个兄弟。**它住在 `components/` 没有任何理由，除了当初写在那儿。**

## 移动清单 → `lib/tool-view/`（basename 不变）

| 从 | 行数 |
| --- | --- |
| `components/assistant-ui/tool/fallback-model/index.ts` | 1502 |
| `components/assistant-ui/tool/fallback-model/format.ts` | 153 |
| `components/assistant-ui/tool/fallback-model/targets.ts` | 74 |
| `components/assistant-ui/tool/fallback-model/types.ts` | 88 |

**4 个文件 / 1817 行。**

**导出名字一个都不改。** 消费者只换 import 路径——那是这次搬运"只是搬家"的证据。

## 一个名字碰撞，正好说明这次改名值得

`app/settings/fallback-models-field.tsx` 和 `config-field.tsx` 里的 **`FallbackModelsField`
是另一件事**（"回退**模型**"的配置字段，真的和模型有关）。两个 `fallback-model(s)` 在同一个
仓库里指两件不相干的事——这正是要改名的理由，也在派工单里点名，免得执行者把它们一起改。

## 要改的引用（这个列表是量出来的，但仍然要自己重算一遍）

```
components/assistant-ui/mcp-setup-tool.tsx        2 处（barrel + format）
components/assistant-ui/clarify-tool.tsx          2 处（barrel + format）
components/assistant-ui/tool/run-summary.ts        1 处
components/assistant-ui/tool/delegate-model.ts     1 处
components/assistant-ui/tool/approval.tsx          1 处
components/assistant-ui/tool/fallback.tsx          1 处
components/assistant-ui/tool/delegate.tsx          1 处
components/assistant-ui/thread/changed-files.ts    1 处（绝对路径写法）
components/assistant-ui/tool/approval.test.tsx     1 处
components/assistant-ui/tool/fallback-model.test.ts 1 处（测试跟着被测文件走）
```

写法对照（这几种都要改）：

| 旧 | 新 |
| --- | --- |
| `./fallback-model`（在 `tool/` 里） | `@/lib/tool-view` |
| `./tool/fallback-model`（在 `assistant-ui/` 里） | `@/lib/tool-view` |
| `./tool/fallback-model/format` | `@/lib/tool-view/format` |
| `@/components/assistant-ui/tool/fallback-model` | `@/lib/tool-view` |

```bash
cd apps/desktop/src
rg -n "fallback-model" --glob '!app/settings/fallback-models-field*'
```

**五种写法都要覆盖**（`from`、`import()`、`require()`、`vi.mock()`、副作用 `import '…'`），
**测试文件也要覆盖**。

## 顺手修一处过期注释

`components/ui/tool-icon.tsx:10` 有一句注释提到 `tool-fallback-model.ts`——那个文件名
**早就不存在了**（它是这个目录改名前的旧名）。改成新路径。这是注释，不是 import，
所以单独一个 commit，或者放在同一个 commit 里但说明它是注释。

## 不做的事

- **不要动 `delegate-model.ts`。** 它虽然只 import 这一个族，但它自己 import 了
  `@/store/subagents`（rank 1），所以它**去不了 `lib/`**（会开 `lib → store` 上行边），
  只能去 `application/` 或留在原地。那是另一件事。
- **不要动 `app/settings/fallback-models-field*` 和 `config-field.tsx`。** 那是"回退模型配置"，
  和这批无关（见上）。
- **不要切 `index.ts`。** 1502 行保持不动——单独查过：那五段里只有
  `countDiffLineStats` 有外部消费者，其余四段的消费者**只有 `index.ts` 自己**，
  所以切分今天的收益是零。等真出现"文件外的人要其中一片"再切，那时切口由需求决定。
- **不改任何函数体、不改导出名。** 这是改名 + 搬家。

## 验证

```bash
cd apps/desktop
npm run typecheck && npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers && npm run test:ui
```

基线：**776 文件 / 7466 个**；守卫 **16/16**；账本 **0**（前后都是 0）。

`fallback-model.test.ts` 跟着走，**断言不许改**。

## 停止条件

- **四个文件里任何一个需要 rank ≥ 1 的东西。** 表是量出来的；真出现 import，
  报告符号，不许加转发 shim。
- **某个消费者的 import 是 `import type`**（`approval.tsx`、`delegate.tsx`、`approval.test.tsx`
  都是类型导入）。类型导入照样要改路径——`import type` 走的是同一个模块解析。
- **`tool-icon.tsx` 那句注释里的文件名和实际不符。** 它本来就不符（旧名）；照新路径写。
- **测试需要改断言。**
- 不要读、改、stage `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。
