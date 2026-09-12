# Batch 17 — session 的两件残余离开 UI 层

**Edges paid off: 0.** 本批不还账（账本已经是 0），它做的是把**住错层的模块搬下去**。
账本在本批前后都必须读 **0**。

这一批接 batch [16](16-session-recovery-sink.md) 和 `d5964ed`：那两轮已经把
`use-session-actions/` 里九件会话语义搬进了 `application/session/`，本批是同一簇里剩下的两件。

## 为什么是这两件

两件都是**会话语义**，不是界面：一件把网关事件流归一化，一件缓存会话状态。
它们都不渲染、都不碰 React。移动的资格已经量过（下节），不是估的。

| 从 | 到 | 行数 |
| --- | --- | --- |
| `app/session/hooks/use-message-stream/utils.ts` | `application/session/message-stream-utils.ts` | 227 |
| `app/session/session-state-cache.ts` | `application/session/session-state-cache.ts` | 167 |

第二件保持原名（`session-state-cache` 已经足够领域化）。第一件改名，因为
`application/session/utils.ts` 会是一个和 `app/session/hooks/use-session-actions/utils.ts`
同名却不同层的陷阱名——这一类同名混淆在这个仓库已经造成过返工。

## 证据：整组移动后组外闭包是干净的

按**整组一起移动**算（不是逐文件算——逐文件算会把组内兄弟误判成阻塞），
组外闭包 19 个模块，其中**没有任何一个高于 rank 2**：

```
$ node <closure 工具> --group 2 \
    app/session/hooks/use-message-stream/utils.ts app/session/session-state-cache.ts
群 2 个文件 → 目标 rank 2
  组外闭包 19 个模块
  ✓ 干净：组外没有任何高于目标层的东西
```

**这个"整组算"的方法是上一轮学到的。** 逐文件算时 `app/starmap/color.ts` 会显示"拖 rank5"，
而那个 rank5 就是它同目录的兄弟——一个必然同行的兄弟不是阻塞。**先按组算，再决定批次。**

## 要改的引用

生产侧当前只有两个文件提到第一件（`use-message-stream/utils`），第二件的导入者需要现场重算：

```bash
cd apps/desktop/src
rg -l "use-message-stream/utils|session-state-cache" --glob '!*.test.*'
```

已知的：

- `app/session/hooks/use-message-stream/gateway-event/message-stream.ts`
- `app/contrib/hooks/use-session-tile-delegate.ts`
- `app/contrib/wiring.tsx`

**导入者要自己用 rg 重算一遍，把五种写法都覆盖**（`from`、`import()`、`require()`、
`vi.mock()`、副作用 `import '…'`）。这个迁移已经因为只看 `from` 漏过七次，
其中两次是派工单自己写错的。测试文件的导入者同样要覆盖——上一轮
（`d5964ed`）就是因为漏了测试的 `./x` 相对引用，typecheck 才红了一次。

## 已否决的替代（记下来，免得重开）

- **把 `app/session/hooks/use-message-stream/gateway-event/` 整目录一起搬。**
  那个目录是下一件事（README 的决定 A），它**不是**整目录都能搬：数过十个文件之后，
  六件干净、四件各自有一个具名的障碍——`message-stream.ts` 够着 `components/chat/vibe-hearts`，
  `tools.ts` 够着 `components/composer/suggestion-providers/*`，
  `session-info.ts` 够着 `use-prompt-actions/rewind`（外加**本批正在搬的** `../utils`），
  `desktop-bridge.ts` 够着预览/终端/引导。本批只搬自己这两件，把那个目录留给决定 A。
  （这一段原本写的是"该目录四件都拖 app 层"，是错的：`status.ts`、`lifecycle.ts`、
  `input-requests.ts` 够着的都是 rank 0/2 的东西，它们本来就干净。）
- **把这一批并进 18/19。** 目的地不同（这一批去 `application/session/`），
  消费者不同，合并只会扩大一批的回滚面。

## 验证

```bash
cd apps/desktop
npm run typecheck
npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers
npm run test:ui                                     # 再跑一次：账本不许动
```

基线：测试 **776 文件 / 7466 个**；层序守卫 **16/16**；账本 **0**。
**本批前后账本都必须是 0。** 涨了说明闭包算错了；跌到负数是不可能的，出现就说明账本被手改了。

## 停止条件

- **移动后的模块需要 `app/` 里的任何东西。** 上面的闭包说不需要。真出现 import，
  说明"整组算"的结论错了——报告是哪个符号，**不许在 `app/` 里加转发 shim 去桥接**。
- **你又发现一个闭包表里没列的 `import()` / `require()` / `vi.mock()`。** 用五种写法重算，
  并说明你用的是哪几种。
- **测试需要改。** 需要改测试就说明行为跟着代码搬家了，那不是搬运，是重写，停下来报告。
- 不要读、改、stage `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。
