# Harness 扩容会话 — goal 开头提示词（新 worktree 用）

把这整段交给新会话即可（工作树：`/home/maoqh/projects/agent-box-harness-expansion`，
分支 `feature/harness-expansion-v1`）。

---

你在 AgentBox 的独立工作树里工作，任务是**按优先级尽可能多地接入第三方 Harness**，
照抄已经接入的四家（Pi / Hermes / OpenCode / Codex）的全部做法，**能接几家接几家，不设上限**。

开始前完整读取并严格执行（顺序）：

1. `AGENTS.md`
2. `docs/implementation/master-plan.md`
3. `docs/implementation/manifest.json`
4. `docs/implementation/work-orders/43-harness-expansion.md` ← **本工单是你的唯一调度权威**
5. `docs/implementation/status.md`（了解已接入四家的现状与分账方式）

参考对象（**只读**，不修改）：`/home/maoqh/projects/agent-box-server-round1`（已接入四家的实现、
四个生产门脚本、工件构建脚本、两份证据文档）与 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1`
（只在最后跑 UI 门，**不写任何前端文件**）。

第一优先级不是写代码，而是 **§3 的接入卡**：每接一家之前，先从**官方文档/仓库/`--help` 只读探测**
里把：安装与钉版、入口形态（ACP / app-server / HTTP+SSE / CLI-headless）、配置与凭据入口、模型
配置、会话与续接语义、流式与终态判定、审批与附件、native state 目录——全部写成卡片。
**形态未定就不动手**：补文档、只读探测，仍不定就记账跳过。

队伍里允许：只读子代理收文档/调研（最多两个并行，写集不重叠）；共享面（注册表、能力表、
status、锁、提交）只能由你串行做。

硬性规则（违反即返工）：

- 能力声明**必须有观测证据**，没有就声明 false（四家的 `attach`/`permissions` 是范例）。
- **假端点证据与真实模型证据分账**；未观测项显式记账并给理由，不得静默跳过。
- **不阻塞**：每家 60–90 分钟时间盒，卡住就写进阻塞账（命令/退出码/脱敏错误）并立刻跳下一家；
  绝不放宽断言、伪造证据或把假端点结果说成真实模型结果。
- 真实模型门最后统一串行跑，每家 2 轮（首轮 nonce、次轮回忆）；允许使用用户提供的
  DeepSeek 密钥做真实调用，累计仍受 **≤¥10** 约束，先按最坏情形预留，逐家记账。
- 不读真实 `~/.codex` 或其它登录态；凭据只读注入，**绝不进 argv/日志/证据/Git**。
- 不 reset/stash/clean、不 merge main、不 push；只显式 stage 自己的路径。

优先级（无上限，按序处理，做完一家再下一家）：

1. **DeepSeek Harness（`dsh`）** — npm `@deepseek-ai/dsh`，MIT，TypeScript，"everything is a plugin"
   （Cordis），**官方标注 developer preview 会有破坏性变更**；入口 `dsh web` 起本机 Web UI
   `127.0.0.1:3080`（`--no-open` 不开浏览器）。README 未文档化配置/凭据/续接/协议，去读它的
   `docs/`、`AGENTS.md`、`package.json` 与源码把形态判出来；**必须钉精确版本**。
2. **Claude Code** — 注册表里 `driver = "claude"` 已预声明；ACP 适配器存在，但 **38 号调研记过其
   SDK 的许可证问题**，先查证，查不通就记账跳过。
3. **Gemini CLI / Qwen Code**（同上游，有 ACP，npm 固定版本）
4. **Goose（Block）**（`goose acp`，Rust 单二进制，工件最好固定）
5. **Aider**（无 ACP，走 OpenCode 那条中立 driver 接缝，先看有没有 headless/JSON 输出）
6. Crush / OpenHands 等（前五家做完再碰）
   排除：闭源 CLI（Cursor/Amp/Droid）、靠终端屏幕解析的、无 resume 语义的。

每家的完成定义与验收看 43 号工单 §4/§7；阻塞账格式看 §6。每接入 3 家或每 2 小时更新
status/progress 并提交检查点。

最终回复必须给出：**本轮过门 N 家、封装就绪 M 家、阻塞 K 家**（各自原因）、费用与请求数、
清理结果，以及哪几家还没碰。不允许只报"接了几家"而不给未完成项。
