# P14 — 空状态重做 + 状态语义换血（Unavailable / Gateway）+ Hermes 语义清理

基线：P08（输入条）之后（空状态要嵌同一个 composer）。本单只动**空状态**、**就绪/连接状态语义**与
**用户可见文案的品牌语义**；输入条行为在 P08、会话区在 P09、侧栏在 P10。

```text
之前
├── chat-empty-slot.tsx        ⚠ 小图标 + "No sessions yet" + 两个按钮，空荡荡
├── runtime-readiness.ts       ⚠ 'checking' | 'needs_setup' | 'ready' | 'unavailable'（Hermes 桌面线的模型）
│                                 → 顶栏一个孤零零的 "Unavailable"，composer 里也写 "Unavailable"
├── gateway-liveness-policy.ts ⚠ "Gateway offline" + Idle/Disconnected 弹层（我们没有 gateway 这个物）
└── 222 个源码文件 + 多套 i18n 里带 "Hermes" 品牌语义（含用户可见的报错文案）
之后
├── 空状态                     ◀ 品牌标识 + 问候语 + **同一个 composer**（含"选择项目"）+ 建议项
├── 状态语义                   ◀ 就绪/未就绪**只来自我们的事实**（Server 生命周期连接 + hello + 已选项目），
│                                 且**必须给出原因**，不出现裸的 "Unavailable"
├── 左下角                     ◀ 改成"服务连接"（或删除）；Gateway/liveness 语义不留在产品里
└── 品牌语义                   ◀ 用户可见处统一为 AgentBox；**家族名 hermes 保留**（那是一个 harness）
```

## A 空状态重做

- 目标形态（参照用户给的两张图）：**品牌标识 + 问候语 + 大 composer（项目选择 + 输入 + 控制条）+ 建议项**；
  空状态与输入条是**同一个 surface**，所以**复用 P08 的 composer**，不另写一套。
- 建议项（"周报总结/报错修复/…"那类）**只在有真实能力时出现**：点下去要真的能建会话并发出；
  没有后端支撑的建议项**不显示**（禁止摆设）。
- 门：**G1** 无会话时不出现"空荡荡"的孤立按钮；**G2** 建议项点击真能走通一轮（或该建议项不存在）；
  **G3** 与 P08 的 composer 是同一实现（不重复造）。

## B "Unavailable" 的诊断与修复（**先诊断，不许只换文案**）

- **现状（第一手）**：`lib/runtime-readiness.ts` 定义了 `display: 'checking' | 'needs_setup' | 'ready' | 'unavailable'`，
  输入是 `setup.provider_configured` 与 `runtime.ok/error`——**这是 Hermes 桌面线的就绪模型**，与我们的产品事实
  无关：我们的事实是 **Server 生命周期连接**（endpoint + token；类型化原因 `root_unset` / `token_unavailable` /
  `port_invalid`）+ **hello/capabilities** + **是否选了工作区**。
- **要做的**：① 逐处找出这个字面量是怎么变成界面上那两处 "Unavailable" 的（顶栏 pill 与 composer 占位），
  给出第一手证据（哪条状态映射到哪）；② **改成从我们的事实派生**，且**必须带原因**
  （例如"未选择项目"、"服务未配置：未设置 AGENTBOX_SERVER_ROOT"、"令牌不可读"）；
  ③ 顶层 pill 在**没有问题时不得出现**（空状态里不该有一个红/灰感叹号似的字样）。
- **判据**：出现"未就绪"时，用户一定能看到**为什么**与**下一步做什么**；只在真正不可用时才拦发送。
- 门：**G4** 三张反例截图/用例（未选项目 / 服务未配置 / 正常）各自的文案与行为正确；
  **G5** 任何路径都不再出现裸的 "Unavailable"（有测试或字符串守卫）。

## C 左下角 Gateway（改成产品语义，改不了就删）

- **现状（第一手）**：`lib/gateway-liveness-policy.ts`、`lib/gateway-events.ts`、`lib/connection-display.ts`、
  `lib/session-source.ts`、`lib/remote-url.ts`、`lib/query-client.ts`、`main.tsx`、`global.d.ts` 等十余处
  都在用 gateway 概念；界面表现是左下角 "Gateway offline" + 一个 Idle/Disconnected 弹层（带重连/打开/电源图标）。
- **要做的**：先做**一页台账**：gateway 在代码里到底代表什么（它的事件与 liveness 由谁喂），
  然后二选一：
  1. **映射**成我们的语义——"**服务连接**"（Server 生命周期连接的状态与原因码 + hello），弹层只保留
     **我们真有的动作**（重新连接 = 重新安装连接；打开设置）；
  2. **删除**：若它代表的东西在我们的产品里**不存在**（例如某个本地 gateway 进程），整套移除，
     包括左下角那一行与弹层，**不留半死状态**。
- 判据：**界面上不再出现 gateway 这个词**，且留下的是**我们能解释其来源**的状态。
- 门：**G6** 台账齐全（每个用到的 gateway 符号 → 映射/删除的结论）；**G7** 处理后有第一手证据
  （正常/未配置/断开三种状态各自的显示）；**G8** 删除路径下**不存在**孤儿引用（无死代码、无未用事件源）。

## D Hermes 品牌语义清理

- **规模（第一手）**：非测试源码 **222 个文件**含 "Hermes"；i18n 多套语言各自大量出现（例：`ar.ts` 113 处）。
  分两类，**规则不同**：
  - **用户可见**（i18n 文案、报错消息、窗口标题、About、菜单、状态栏）：**必须**改成产品语义（AgentBox）；
    典型例子：`lib/desktop-fs.ts:97` 的 `'Hermes Desktop bridge is unavailable'`——它是**会被用户看到的**。
  - **内部标识**（模块名如 `lib/hermes-open-target.ts`、类型名、注释）：**可选**，但**凡是会漏到界面/日志/报错**的
    必须一起改；纯内部重命名**不与本单捆绑**（避免 222 文件的大搬迁拖住 UI 修复）。
- **家族名例外**：`hermes` 作为一个**harness 家族**的名字（注册表里的 family、适配器、模型文档字段）
  **必须保留**——清理的是**产品品牌**，不是家族。
- 门：**G9** 用户可见文案里 "Hermes" **零命中**（家族名出现处必须能指出它指家族）；
  **G10** i18n 的导入边界与既有语言用例不退化；**G11** 有字符串守卫测试，防止再写回品牌词。

## 范围与调度

写集：`docs/desktop-product-delivery/**`、`apps/desktop/src/**`（含 `i18n/**`、`lib/**`、
`components/assistant-ui/**`、`features/chat/**`、`app/**`）、`apps/desktop/e2e/**`、`tests-js/**`。
保护路径见 manifest；单 Windows 构建槽；按 `handoff-policy.md` 取放写权。
**本单零后端改动**（若 B 的诊断发现根因在后端，**停下记录**并另派后端单，不猜、不硬修）。

## 边界

- 不改输入条行为（P08）、会话区（P09）、侧栏（P10）；
- 不做家族重命名；不做 222 文件的内部搬迁（除"会漏到用户面前"的那些）。
