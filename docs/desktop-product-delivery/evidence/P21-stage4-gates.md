# P21 阶段 4 证据：四项检查真跑（2026-09-18）

工作树 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1`，分支
`feature/agentbox-desktop-product`。工具链：Node v22.23.2 / npm 10.9.8 / vitest 4.1.10 /
zod 4.4.3（`npm install --no-audit --no-fund` 后测得；本树此前无 node_modules）。

## 1 tsc

```bash
npm run --workspace apps/desktop typecheck   # tsc -p . && -p tsconfig.electron.json && -p tsconfig.e2e.json
# TSC_EXIT=0（三个项目全过）
npm run --workspace apps/shared typecheck
# SHARED_TSC_EXIT=0
```

## 2 eslint

```bash
npm run --workspace apps/desktop lint        # eslint src/ electron/
# ESLINT_EXIT=1 —— 16 errors / 181 warnings，分布在 12 个文件
```

**这 16 个 error 全部落在 P21 未触碰的文件里**（用 `-f json` 逐条比对 P21 的改动清单，
交集为空）：

| 文件 | errors |
| --- | --- |
| `src/dev/contracts/product-copy-guard.test.ts` | 4（`no-useless-escape`） |
| `src/features/chat/agentbox-process-view.test.tsx` | 1（导入顺序） |
| `src/features/chat/composer/chat-bar.tsx` | 1 |
| `src/features/chat/sidebar/agentbox-sessions/agentbox-actions-row.tsx` | 1 |
| `src/features/chat/sidebar/agentbox-sessions/agentbox-global-sessions.tsx` | 1 |
| `src/features/chat/sidebar/agentbox-sessions/agentbox-session-list.tsx` | 1 |
| `src/features/settings/account-list.test.tsx` | 1 |
| `src/features/settings/agentbox-model-settings.tsx` | 1 |
| `src/features/settings/index.tsx` | 1 |
| `src/features/settings/product-settings.tsx` | 1 |
| `src/features/settings/provider-presets.test.ts` | 1 |
| `src/store/agentbox-session-unread.test.ts` | 2 |

⇒ **既有基线，不是本单引入**（这 12 个文件与 HEAD 逐字节相同，P21 的 diff 不含它们）。
本单遵守"不改无关注释/不扫荡"的改动纪律，没有顺手改这 12 个文件；已登记为本单的
**已知缺口**（见 status.md 的检查点报告：建议单独一张 lint 卫生单，或用一次批准的
`eslint --fix` 批次清掉——其中 12 个 error 是机械可修的导入顺序）。

**P21 改动文件单独跑**：

```bash
npx eslint $(git diff --name-only HEAD~3..HEAD | grep -E '^apps/desktop/src/.*\.tsx?$' | sed 's|^apps/desktop/||')
# ✖ 26 problems (0 errors, 26 warnings)
```

0 error；26 warning 全是测试文件里 `document` 的 `no-restricted-globals`
（jsdom 测试的既有写法，P20 的 `work-status-panel.test.tsx` 同一批）。

## 3 build

```bash
npm run --workspace apps/desktop build
# BUILD_EXIT=0
# dist/index.html + assets present；electron main/preload bundle 产出；
# stage-native-deps: node-pty (linux-x64) + get-windows (linux) 已 stage
```

## 4 vitest（全量，两项目）

```bash
npm run --workspace apps/desktop test        # vitest run
# VITEST_EXIT=1
# Test Files  5 failed | 978 passed | 2 skipped (985)
# Tests       4 failed | 10197 passed | 6 skipped (10207)   ← 阶段 4b 修复后复跑（首次 10195）
# Duration    ~178s
```

**5 个失败文件全部在 `|electron|` 项目，且全为宿主基线，与 P21 无交集**：

| 失败文件 | 现象 |
| --- | --- |
| `electron/windows/app-icon.test.ts` | 0 test（`getElectronPath`：本环境未下载 electron 二进制） |
| `electron/host-capabilities/contract.test.ts` | 0 test（同上） |
| `electron/host-capabilities/platform/window-below.test.ts` | 0 test（同上） |
| `electron/host-capabilities/credentials/mcp-oauth-callback-ipc.test.ts` | 3 条：回环监听/噪声不 settle/错误参数转发（本机端口策略） |
| `electron/legacy-hermes/api-transport.test.ts` | 1 条 `sanity: … would have re-hit the server`（live 重试观测） |

对照：P20 收口时记的是"electron 35 失败=既有宿主相关基线集"（环境不同、计数不同，性质相同）。
**`|ui|` 项目全绿（978 文件通过），P21 的改动全在 ui 侧**。

P21 触及的五个测试文件计数：

| 文件 | tests |
| --- | --- |
| `src/types/wire/wire-v1.test.ts` | 28（本单 +11） |
| `src/features/chat/work-status.test.ts` | 16（本单 +4） |
| `src/features/chat/work-status-panel.test.tsx` | 12（本单 +6） |
| `src/features/profiles/profile-read-facts.test.ts` | 9（新文件） |
| `src/features/profiles/profile-role-settings.test.tsx` | 7（本单 +4） |

另：`npm test --prefix tests-js` → **8 files / 47 tests 全过，exit 0**。

## 5 三门的反例演练（G1/G2/G3）

| 门 | 反例操作 | 观测 |
| --- | --- | --- |
| G1 摘要对齐 | 用旧值 `774640498429ca9f…` 当"当前值" | 拒绝：它是 `d7464166` 时代的摘要，与 HEAD 重生成值 `6e8ae84a…`/`f5d27269…` 不同；README 里旧值已标注"曾落后"（阶段 1 证据 §2） |
| G1 摘要对齐 | 用后端登记值 `64dc9961…` 当"当前值" | 拒绝：本树权威已含 57 C + 58–64，哈希不等；README 把它标为"后端已登记的最后一条"，不是当前值 |
| G2 不画假值 | 让 `workspaces.gitStatus` 六字段全 null | 卡片逐字段显示 `Not obtainable (GIT_UNAVAILABLE)`，测试同时断言文本不含 `Additions0` |
| G2 不画假值 | 让 `profiles.memory` 答 `available:false` | `profileMemoryView` 返回 `null` ⇒ 分区与导航项都不渲染（测试断言两者皆无） |
| G2 不画假值 | 让执行行 `pid:null, pidReason:PID_NOT_REPORTED` | 显示 `Not reported (PID_NOT_REPORTED)`，`pidIsReason=true`；断言不含 `PID: 0` |
| G3 只读 | grep 四个面的写方法引用 | 无命中（退出码 1）；读路径只有 `workspaces.gitStatus`/`executions.list`/`profiles.memory`/`assets.bindings` |
| G2 不静默截断 | 让 `executions.list` 以一个类型化拒绝失败（`INVENTORY_LIMIT_EXCEEDED`，>200 行） | 卡片**仍然渲染**并显示该拒绝（`[data-work-status-executions-error]`），不是消失；同理 Git 读失败显示 `[data-work-status-git-error]` 而不是六行空白 |
| G2 不静默截断 | 读**失败**（不是"没有事实"） | 阶段 4b 修掉了初版"失败即当无事实、卡片消失"的行为（那会把拒绝藏起来）；现在失败带原因上屏 |

## 6 未跑/未验（如实登记）

- 未对**真实后端**跑一次端到端（本单不授权真实模型调用，且后端 58–64 的服务不在本机运行）。
  四个面在真实服务上的首次联调属于"合并回主树之后"或后端重锁之后的集成检查项。
- 未跑 Playwright e2e（`apps/desktop/e2e`）：本单未改 e2e 断言，且 e2e 需要真实服务进程。
