# E6 — Electron composition knot extraction

状态：`open`

## 目标

把 Electron 的两个 composition 大文件收回为真正的装配层：Desktop boot progress 归
`app/`，Hermes 本地后端启停归 `legacy-hermes/`，favicon/title/MIME 等实现归
`host-capabilities/preview/`。本单不接 AgentBox、不设计 Desktop 产品协议，也不改变现役
Hermes 行为。

本单使用 E0–E5 审计的最新基线：`composition/bootstrap-env-composition.ts` 约 7,514 行，
`composition/api-proxy-composition.ts` 约 1,479 行。数字是审计快照，不要求执行者为派工目的
再次全仓测量；最终报告写实际结果即可。

## Before / after

```text
electron/
├── composition/                              ⚠⚠ 8,993 行，装配与实现混住
│   ├── bootstrap-env-composition.ts          ⚠⚠ boot state + Hermes spawn + pool + host wiring
│   └── api-proxy-composition.ts              ⚠ API 组装 + favicon/title/MIME 实现
├── app/                                      ✓ Desktop 生命周期
├── host-capabilities/preview/                ✓ 宿主 Preview 执行器
├── legacy-hermes/                            ✓ 现役兼容适配器
└── workcore/                                 ✓ 空生产 slot；本单不接线

                         ↓ E6

electron/
├── app/
│   └── boot-progress.ts                      ◀ Desktop 启动状态与 typed failure latch
├── host-capabilities/preview/
│   ├── favicon/title cache leaves            ◀ 从 API composition 迁入
│   └── mime.ts                               ◀ MIME 判定
├── legacy-hermes/
│   └── local-backend.ts                      ◀ startHermes / spawnPoolBackend 与启停细节
├── composition/
│   ├── bootstrap-env-composition.ts          ✓ 只创建依赖、安排启动顺序、注册回调
│   └── api-proxy-composition.ts              ✓ 只选择 connection/transport 并装配 IPC
└── workcore/                                 ✓ 原样不动
```

## 不可变边界

1. `composition/` 可以选择和连接实现，不得继续实现 boot state、Hermes spawn、缓存、MIME、
   Git、文件或进程策略。
2. `legacy-hermes/` 可以消费 `app/`、`process/`、`host-capabilities/`，不得反向 import
   `composition/` 或 `main.ts`。
3. `process/`、`host-capabilities/`、`workcore/` 不得 import `legacy-hermes/`。
4. 不改 `preload.ts`、公开 IPC channel、Renderer API、Session/Profile/Connection 语义。
5. 不安装 Work Core lifecycle，不增加 fallback，不把 Hermes 字符串改名伪装成通用协议。
6. 现役 Hermes 的 argv/env、ready sentinel、health/WS 探测、pool key、restart/shutdown 顺序、
   typed error 与 bootstrap latch 行为必须保持。
7. 测试调用函数验证行为；不得新增读取 `.ts` 源码文本的结构测试。

## 允许范围

- `apps/desktop/electron/composition/{bootstrap-env-composition,api-proxy-composition}.ts`
- `apps/desktop/electron/app/boot-progress.ts` 及 colocated tests
- `apps/desktop/electron/legacy-hermes/local-backend.ts` 及必要的 colocated tests
- `apps/desktop/electron/host-capabilities/preview/` 中本单迁入的窄叶子及 tests
- `apps/desktop/electron/main.ts` 仅允许等价 import/wiring 调整
- 本工作单、索引与 `docs/architecture/electron-host-boundary.md`

禁止触碰 Renderer `apps/desktop/src/**`，也禁止读取、修改或 stage：

- `apps/desktop/src/agentbox/`
- `apps/desktop/src/plugins/agentbox-lab/`
- `docs/architecture/acp-desktop-phase1-design.md`
- `docs/desktop-src-tree.md`

## 阶段和硬前置

```text
E6.1  boot progress 抽到 app/boot-progress.ts
  │   硬前置：必须先完成；它解除 launch ↔ composition 的回调结
  ▼
E6.2  startHermes / spawnPoolBackend 抽到 legacy-hermes/local-backend.ts

E6.3  api-proxy 中 favicon/title/MIME 等实现归 host-capabilities/preview/
      与 E6.1 文件不重叠，可由主执行者视资源并行安排

E6.4  composition 收口、组合验证、独立 review、状态更新
```

E6.1 和 E6.2 不得倒序。除这条内容依赖外，主执行者可以在允许范围内调整小步骤、文件名、
委派方式和测试时机；遇到只为解除本范围内 import cycle 所需的窄 dependency interface，允许
提取，但必须保持单一实现且不得演化成 registry/plugin framework。

## 主执行者的资源协调权

- 继续使用当前长期 goal，不开第二个顶层 goal。
- 主执行者可以把 Renderer Batch 30 与 E6 分给互斥写区的工作者，也可以顺序执行；它对共享
  工作树、Git 索引和提交拥有唯一协调权。
- 子任务可以做定向分析、在明确独占目录内编辑或运行小测试；主执行者统一审阅、显式 stage
  和提交，不允许两个写者同时改 `main.ts`、status 或同一 composition 文件。
- 阶段提交应可定位。E6.1 与 E6.2 必须分开；E6.3 可独立提交，也可在自身边界完整时合并。
- 定向测试应紧随高风险阶段；完整 typecheck、Electron project、lint、diff-check 可以与
  Batch 30 在双方都到稳定同步点后各合并运行一次，不为两个任务重复消耗重型门。
- 不得同时运行两个完整 Vitest/Desktop 门；若机器资源紧张，正确动作是排队，不是提高并发。

## 必须保持的行为

### Boot progress

- failure `errorCode` 在同一次失败期间保持粘性，后续通用文字不得抹掉首因；只由成功清除。
- 阶段不能倒退；同一事实不重复广播。
- failed bootstrap 不得因重构重新进入无限重试。
- IPC 继续通过现有 accessor 读取同一状态对象/等价快照。

### Local Hermes backend

- executable resolution、primary 与 pooled backend 的差异不变。
- session token 与 child env 的来源、作用域和零日志纪律不变。
- stdout ready、health、WS upgrade 的顺序和超时语义不变。
- restart budget、shutdown、tree cleanup 与 ownership 文件语义不变。

### API proxy leaves

- cache key、TTL、MIME 结果、路径安全和错误结果不变。
- `api-proxy-composition.ts` 只注入/调用这些实现，不复制一份逻辑。

## 验证策略

主执行者先复用现有相关测试选择器，不为本单重跑无关 UI 套件。最低证据：

```bash
cd apps/desktop
npx vitest run --project electron \
  electron/legacy-hermes/backend-health.test.ts \
  electron/legacy-hermes/primary-backend-startup.test.ts \
  electron/legacy-hermes/lifecycle.test.ts
npm run typecheck
npx eslint electron/
git diff --check
```

若现有测试名称在施工中已经改变，执行者按行为选择等价的 boot progress、local backend、
readiness、pool、API proxy/cache 测试，并在汇报中列出实际命令。完整 Electron project 可与
Batch 30 最终门合并一次；已登记的 loopback 基线失败必须按测试名对照，不能冒充本轮回归，
也不能借 E6 顺手修改。

独立 reviewer 必须确认：

- `composition` 不再定义 boot state 或直接 spawn Hermes；
- `legacy-hermes/local-backend.ts` 不 import `composition`/`main`；
- preview leaves 没有 Hermes/Profile/Session 决策；
- `main.ts` 仍只是启动顺序、wiring、IPC 注册和 lifecycle handlers；
- Renderer、preload、IPC 公共合同和 Work Core production slot 均未变化。

## 停止条件

- E6.1 无法在不改变公开 boot state/error 语义的前提下抽离。
- E6.2 需要反向 import composition、复制状态或引入第二权威。
- 必须修改 Renderer/preload/IPC channel 才能继续。
- 必须决定 AgentBox Desktop API、Session/Profile/Connection 权威或 Work Core 产品协议。
- 需要放宽路径/凭据/进程清理安全边界，或改变现役 Hermes 启动行为。
- 与 Batch 30 或用户未跟踪成果发生未解决的实际文件冲突。

命中停止条件时写 `ELECTRON_COMPOSITION_KNOT_PARTIAL` 并报告首因；不要扩权。

## 验收状态

只有 E6.1–E6.4、定向行为证据、共享最终门和独立 review 全部成立，才写：

```text
ELECTRON_COMPOSITION_KNOT_GREEN
```
