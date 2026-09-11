---
name: architecture-tree-report
description: >-
  Use this whenever architecture work happens in this repository — layer or
  dependency cleanup, import-direction problems, "梳理架构", "盘点混乱点", deciding
  where a module belongs, planning a refactor or a staged migration, tracking
  structural debt, or answering "现在架构什么情况". In this project the annotated
  directory tree IS the interface — the user reads a tree with right-hand
  annotations, not prose or letter-coded summaries. Every stage of architecture
  work must open or close with one. Trigger this even when the user only asks for
  a status update or asks a single question about where something lives, because
  the answer is expected in tree form.
---

# 架构汇报：用带标注的目录树

这个仓库的架构工作，**交互形式就是一张带标注的目录树**。用户明确说过，密集的散文式汇报（字母代号 + 百分比 + 满屏表格）他读不懂；树 + 右侧注解他能一眼看完。所以树不是"配图"，它是交付物本身。

## 为什么是树

架构问题的形状是**位置**问题：某个东西住错了房间、某个方向反了。散文会把位置信息压扁成线性叙述，读者要在脑子里重建树；而给一张树，位置和问题就在同一个视野里。字母代号（K1、K2）更糟——它要求读者先记住一张对照表，而那张表本身才是要传达的东西。

一条经验：**如果汇报里有某个记号需要读者回翻上文才能理解，那个记号就是失败的。** 名字取成"布局状态住在组件层"这样的词组，不要取成 K1。

## 树的形式

围在代码块里，右侧对齐注解。记号只有五个：

| 记号 | 含义 |
|---|---|
| `✓` | 干净，或本轮刚修好 |
| `⚠` | 仍有上行依赖；注解写**条数**和**该去哪儿** |
| `⚠⚠` | **设计结**：需要一个决定，不是一次搬运 |
| `◀` | 本轮变更（新增/移动/删除），注明来自哪一批 |
| `✗` | 已删除 |

示例（这是真实汇报过的形状）：

```
├── components/                             ⚠ 386 文件，问题最集中的一层
│   ├── pane-shell/                         ⚠⚠ 28 文件、9116 行，被 store 抓 17 次
│   │   ├── tree/store.ts                   ⚠⚠ 2029 行状态住在组件层，13 个 store 文件依赖它
│   │   ├── tree/model.ts                   ⚠ 650 行、零 import 的纯模型（本该在 lib）
│   │   └── tree/renderer/                  ✓ 这些确实该留在组件层
│   ├── assistant-ui/thread/user-edit-composer.tsx   ⚠⚠ 928 行，等于第二个 composer，17 条 → app
│   └── ui/ chat/                           ✓ 大部分是正常组件
```

**粒度规则**：顶层全展开；有问题的分支下钻到**文件**；干净的分支合并成一行（`ui/ chat/ ✓`）。树的目的是让人看见问题在哪，不是罗列文件——`lib/` 那 300 个文件不该有 300 行。

## 树后面必须跟三样东西

树本身只回答"在哪"，不回答"有多严重"和"先做哪个"。所以固定跟三段，都很短：

**1. 剩余债务按方向**

| 方向 | 条数 | 归谁 |
|---|---|---|
| `components → app` | 28 | 17 条是第二个 composer，11 条零散 |

**2. 结，按"一个决定能消掉多少"排序**——这是最重要的那段，因为用户要据此排优先级。每个结写：卡在哪、分界线是否清楚、条数。明确区分"分界线已经清楚、只差决定做不做"和"分界线本身还没定"。

**3. 一句"本轮改了什么"**，以及（如果有）**"需要你定的那件事"**。没有待定事项就明说没有，不要为了显得有进展而造一个。

## 让树可信的规则

树上的每个数字都必须是**量出来的**，不是记得的。这个仓库的数字一直在动（一次搬迁就能让 97 变 82），凭记忆写的数字会当场被证伪。

- 数依赖、数文件、数条数之前，先跑命令。用了什么命令如果结论反直觉，就写出来。
- **`npm run arch:tree`** 会从真实仓库和债务账本生成树的骨架、方向表和导入者排名——**先用它**，别手工数（见下）。
- 账本 `apps/desktop/src/dev/contracts/renderer-layers.debt.ts` 是唯一权威的债务清单。它是棘轮：只许变短。树上的 `⚠` 条数要和它对得上。
- 说"已修好"之前，跑一次守卫。`✓` 是有证据的断言，不是"应该没问题"。

## 提出任何搬迁之前，先查这一件事

这是整个仓库最容易踩的坑，已经踩到过三次：**要搬的东西，有没有被更下层导入？**

有的话，往上搬会把"上层抓下层"变成"下层抓上层"——**方向反了，但条数不变**，看起来像白干，或者更糟：`lib/keybinds/`（1386 行）整体上移到 `app/` 会给它的 **9 个**导入者新增上行边（`components` 6、`extension` 1、`lib` 1、`store` 1），而它今天只欠 4 条。所以：

```bash
rg -l "<要搬的模块>" --glob '!*.test.*' . | sed 's|^\./||' | cut -d/ -f1 | sort -u
```

把导入者的层分布打出来，和目的地比一次。目的地是 `app/`，就不许出现 `lib/store/components`；目的地是 `store/`，就不许出现 `lib/`。查完再写进方案，并把这条证据写进汇报——用户会据此判断方案可不可信。

```bash
npm run arch:tree -- --move lib/foo.ts --to store/
```

会直接给出判断。

## 记账与分批

结构性债务要**冻结成账本**，否则每轮的进度无法证明、回退无法察觉。

- 账本只许变短。守卫两头都报错：**没登记的边**失败，**已修好但没删的行**也失败。后者是棘轮真正咬人的地方——它逼着每轮把账还清，而不是留一堆过期行。
- 生成新账本用 `npm run ledger:layers`（校验模式不写文件，所以它能待在正常测试套件里）。
- 机械活按**互不重叠的批次**写成独立实施文档，一批一个文件，每批自带验证步骤和停止条件；批次之间如果碰同一个文件，就规定串行。
- 一个判断标准：**能给目的地、且行为不变的，是机械活，可以交出去；需要先做决定的，留下来自己做。** 把没有目的地的活交出去，等于把判断推给别人，最后要返工。

## 汇报的语气

- 平实的话优先。术语只在用户用过之后才用。
- 先给结论，再给证据。不要把证据铺开当成结论。
- 自己的错要主动写出来，包括自己写的文档里的错。用户明确看重这一点——一次真实的"我算错了 16 应该是 15"，比十句"已完成"有价值。
- 不要把树用散文复述一遍。树说完就往下走。
- 每个阶段**开头或结尾**都要有一张树（开始时：这阶段要动什么；结束时：动了什么 + 还剩什么）。用户要的是"每一阶段都优先用这种形式"。

## 配套脚本

`scripts/arch-tree.mjs`，无依赖，只读：

```bash
cd apps/desktop && npm run arch:tree          # 生成树骨架 + 方向表 + 导入者排名
npm run arch:tree -- --move lib/foo.ts --to store/   # 上移安全性判断
```

它负责**数数**（确定性、手工容易错的部分）；**诊断**（该去哪儿、是不是一个结、为什么）由你来写。不要让它输出它算不出来的判断，也不要把它的原始输出直接贴上去——树要有注解才有用。

脚本没在 `package.json` 里时，直接跑：
`node <repo>/.agents/skills/architecture-tree-report/scripts/arch-tree.mjs`
