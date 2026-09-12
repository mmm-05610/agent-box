# Batch 30 — `app/` 收口为组合根，产品功能整棵退出

**Edges paid off: 0.** 账本前后都是 **0**。

> 这是一个**终端结构批次**，不是新的业务重构。
>
> 它必须在 17–29 全部 merged + reviewed 后单独执行。那些批次正在移动
> `app/chat`、`app/session`、`app/settings`、`app/starmap`、`app/right-sidebar`
> 和 `app/contrib` 里的文件；提前做本单会让它们的路径、测试和碰撞清单全部失真。

## 一、这张单解决什么

今天的 `app/` 同时装着四种东西：

```text
app/                                      632 个 TS/TSX · 163,701 行（派单时实测）
├── contrib/ · gateway/                   应用组合和运行时接线
├── shell/ · overlays/ · command-palette/ 应用骨架
├── hud/ · pet-overlay/ · quick-entry/    独立窗口入口
└── chat/ · session/ · settings/ · …      具体产品功能
```

所以“这是应用组合代码”与“这是某项产品功能”无法从位置判断。决定已经作出：

> **`app/` 只拥有最高层组合。** 它回答应用如何启动、如何组装、如何挂载；
> 它不再充当所有产品界面的总目录。

本单只把这个边界做实。产品目录先**整棵**进入 `src/features/`；不在本单里继续讨论
`chat/`、`session/`、`right-sidebar/` 内部的最终切法。

## 二、终态树（验收接口）

```text
apps/desktop/src/
├── app/                                      ✓ 只剩组合根
│   ├── index.tsx                             应用入口
│   ├── routes.ts                             rank-5 路由/工作区呈现策略
│   ├── routes.test.ts
│   ├── routes.workspace-reveal.test.ts
│   ├── composition/                          注册、注入、生命周期接线
│   ├── shell/                                主窗口公共骨架
│   └── windows/                              独立窗口挂载入口
│
├── features/                                 ◀ 产品功能；本批只整棵搬，不内部重构
│   ├── agents/
│   ├── artifacts/
│   ├── chat/
│   ├── command-center/
│   ├── cron/
│   ├── learning/
│   ├── pet-generate/
│   ├── profiles/
│   ├── right-sidebar/
│   ├── session/
│   ├── session-import/
│   ├── settings/
│   ├── skills/
│   ├── starmap/
│   └── webhooks/
│
├── application/                              ✓ 本批不重新设计
├── store/                                    ✓ 本批不重新设计
├── api/                                      ✓ 本批不重新设计
├── components/                               ✓ 只接收下面点名的 3 个通用 hook
├── extension/ · plugins/                     ✓ 插件边界不变
└── lib/ · types/ · i18n/ · themes/           ✓ 基础层不变
```

**`features/` 在本批仍是 rank 5。** 这是把“组合”与“产品功能”分开，不是把产品功能
下沉成新的业务层。`features/chat` 是否还要拆成 conversation/sessions/browser，
`features/session` 里哪些还该进入 `application/`，都属于下一轮；本单不替维护者决定。

## 三、移动清单

所有目录使用 `git mv`；除 import/mock 路径和记录旧路径的注释外，文件内容保持不变。
测试跟着被测模块走。

### A · 产品功能整棵离开 `app/`

| 从 | 到 |
| --- | --- |
| `app/agents/` | `features/agents/` |
| `app/artifacts/` | `features/artifacts/` |
| `app/chat/` | `features/chat/` |
| `app/command-center/` | `features/command-center/` |
| `app/cron/` | `features/cron/` |
| `app/learning/` | `features/learning/` |
| `app/pet-generate/` | `features/pet-generate/` |
| `app/profiles/` | `features/profiles/` |
| `app/right-sidebar/` | `features/right-sidebar/` |
| `app/session/` | `features/session/` |
| `app/session-import/` | `features/session-import/` |
| `app/settings/` | `features/settings/` |
| `app/skills/` | `features/skills/` |
| `app/starmap/` | `features/starmap/` |
| `app/webhooks/` | `features/webhooks/` |

`app/messaging/` **不在表里**：batch 29 先把它删除。若执行本单时它仍存在，说明前置
未完成，停止；不要搬到 `features/messaging/` 来绕过删除裁决。

本节派单时实测 **505 个 TS/TSX、134,320 行**；17–29 落地后数字会下降。
执行者报告实际移动数字，不把这里的派单快照当验收数字。

### B · 组合代码归 `app/composition/`

| 从 | 到 | 理由 |
| --- | --- | --- |
| `app/contrib/` | `app/composition/` | 它已经是主组合控制器，只是名字不直观 |
| `app/gateway/` | `app/composition/runtime/` | 外部 Runtime 的启动状态和生命周期接线 |
| `app/host-views.ts` | `app/composition/host-views.ts` | host view 的注册副作用 |
| `app/open-session.ts` + test | `app/composition/open-session.ts` + test | rank-5 的“如何打开会话”策略，现有裁决要求留在 app |

`app/index.tsx` 改为从 `./composition` 导出组合控制器。不要保留旧 `app/contrib`
转发目录，不要新增兼容 barrel。

### C · 公共骨架归 `app/shell/`

| 从 | 到 |
| --- | --- |
| 现有 `app/shell/*` | `app/shell/*`（原地） |
| `app/command-palette/` | `app/shell/command-palette/` |
| `app/context-menu/` | `app/shell/context-menu/` |
| `app/overlays/` | `app/shell/overlays/` |
| `app/tour/` | `app/shell/tour/` |
| `app/master-detail.tsx` | `app/shell/layout/master-detail.tsx` |
| `app/page-search-shell.tsx` | `app/shell/layout/page-search-shell.tsx` |
| `app/model-picker-overlay.tsx` | `app/shell/overlays/model-picker.tsx` |
| `app/model-visibility-overlay.tsx` | `app/shell/overlays/model-visibility.tsx` |
| `app/session-picker-overlay.tsx` | `app/shell/overlays/session-picker.tsx` |
| `app/session-switcher.tsx` | `app/shell/overlays/session-switcher.tsx` |
| `app/updates-overlay.tsx` + blocker test | `app/shell/overlays/updates.tsx` + test |

这不是说 command palette、overlay 或 tour 是产品功能；它们是所有功能共享的应用外壳。
某项功能贡献给 palette 的命令仍跟随该功能，只有 palette 的容器/聚合器住在 shell。

### D · 独立窗口统一入口

| 从 | 到 |
| --- | --- |
| `app/hud/` | `app/windows/hud/` |
| `app/pet-overlay/` | `app/windows/pet/` |
| `app/quick-entry/` | `app/windows/quick-entry/` |

同步更新 `src/main.tsx` 的三个动态入口和 perf probe 路径。不要改变 `win=` 参数、
挂载时机、lazy chunk 边界或窗口行为。

### E · `app/hooks/` 逐个归属，不整桶换名字

| 文件 | 到 | 为什么 |
| --- | --- | --- |
| `use-keybinds.ts` | `app/shell/hooks/` | 全局应用键盘调度，是 shell 接线 |
| `use-debounced.ts` | `components/hooks/` | 纯 React 通用 hook，两个视图消费 |
| `use-refresh-hotkey.ts` | `components/hooks/` | 多个功能页复用的呈现交互 |
| `use-route-enum-param.ts` | `components/hooks/` | 多个 tabbed view 复用的路由 UI hook |
| `use-config-record.ts` | `application/config/use-config-record.ts` | 共享后端配置 query/cache，用例级状态，不是 app 组合 |

只有最后一项进入下层，但边界已经由代码证明：它只消费 `api/`、`lib/`、`types/`，
不依赖任何 `app/`/`components/`。不要借机重命名 Hermes 配置语义或改 query key。

### F · 根上只留四个文件

```text
app/index.tsx
app/routes.ts
app/routes.test.ts
app/routes.workspace-reveal.test.ts
```

`routes.ts` 当前是 rank-5 路由策略，已有裁决要求保留。**本单不下沉、不拆它。**
移动后的 `features/` 可以继续消费这个 rank-5 策略；是否建立更窄的 navigation port，
留到下一轮依赖讨论。本单不得用 re-export 或额外 facade 假装已经解决。

## 四、引用改写纪律

1. 覆盖 `import`、`import()`、`require()`、`vi.mock()`、副作用 import 和测试夹具中的路径。
2. 优先改成 `@/features/...`、`@/app/composition/...`、`@/app/shell/...`、
   `@/app/windows/...`；同一小目录内部可以继续相对引用。
3. 不留旧路径转发文件或 re-export 目录。旧路径必须不存在。
4. 不改导出名、函数签名、组件 props、store key、route id、贡献 id、lazy/eager 边界。
5. 路径注释同步更新；产品说明和测试断言不改写。
6. `features/` 加入层序定义，和 `app/` 同为 rank 5；账本仍为 0。
7. 不新增“读取源码文本来断言路径”的 Vitest。仓库根 `AGENTS.md` 明确禁止。
   结构边界进入现有架构配置/ledger 或 ESLint `no-restricted-imports`，不写 regex 源码测试。

## 五、执行顺序与提交边界

本单独占执行，不开并行工作树。它的 import 改写面覆盖整个 renderer，并行只会制造
假冲突和半迁移测试失败。

```text
30.0  前置审计：17–29 全部 merged + reviewed；基线数字落盘
30.1  features/ 整棵迁移                         一个提交
30.2  composition/ 迁移                          一个提交
30.3  shell/ + windows/ 迁移                     一个提交
30.4  hooks 逐个归属 + 层序/文档更新              一个提交
30.5  全量验收 + reviewer + status                一个提交
```

阶段提交是为了让路径迁移可定位，不是允许交付半成品。中间提交可以暂时不 typecheck；
每一阶段结束前必须修到 typecheck green，30.5 以前不得对外标完成。

## 六、验证

开工前记录实际基线；不要背派单时的 776/7466，因为 Zcode 正在吸收 17–29。

```bash
cd apps/desktop
npm run typecheck
npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers
npm run lint
git diff --check
```

迁移完成后再跑同一组，且：

```bash
find src/app -maxdepth 1 -mindepth 1 -printf '%f\n' | sort
# 除 colocated tests 外，只能看见：composition index.tsx routes.ts shell windows

test ! -e src/app/chat
test ! -e src/app/session
test ! -e src/app/settings
test ! -e src/app/contrib
test ! -e src/app/gateway

rg -n "@/app/(chat|session|settings|contrib|gateway|hud|pet-overlay|quick-entry|command-palette|context-menu|overlays|tour)(/|')" \
  src --glob '*.{ts,tsx}'
# 必须零命中
```

测试数应与开工基线一致，**只有 batch 29 已登记的删除量例外**；本单本身不删测试，
所以不能用“只是搬目录”解释任何额外下降。

最后由独立 reviewer：

- 对照本单的终态树检查每个一级目录；
- 抽查 `git diff --find-renames=90%`，证明绝大多数是 rename + import path；
- 核对没有旧路径 shim、没有新行为、没有未登记的测试下降；
- 自己重跑 typecheck、test:ui、层序守卫、ledger、lint、diff-check；
- 把实测文件数、行数、测试数和 commit 写入 status。

## 七、停止条件

- 17–29 任一仍未 merged/reviewed，或 status 与 Git 历史冲突。
- 整棵移动某目录需要改函数体、props、状态结构、route/contribution id 或运行时行为。
- 为了让 `features/` 编译，需要新增低层 → `app/composition|shell|windows` 依赖。
  已存在的 `app/routes`/`app/open-session` 路径只做等价 repoint，不趁机扩大。
- 某个目录无法判断是组合还是产品功能。报告具体文件，不自创第三种垃圾桶。
- `features/` 被迫拆分 `chat/session/right-sidebar/settings` 才能通过。那是下一轮。
- 账本不再是 0，或需要改宽层序豁免。
- 测试断言需要变化（batch 29 已授权的删除除外）。
- 需要读取、修改或 stage 下列未跟踪工作：
  `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。

## 八、验收状态名

只有终态树、完整验证和独立 review 全部成立，才写：

```text
APP_COMPOSITION_ROOT_GREEN
```

否则写 `APP_COMPOSITION_ROOT_PARTIAL`，逐项列出仍留在 `app/` 的业务目录；
不允许用“imports 已更新大半”代替终态。
