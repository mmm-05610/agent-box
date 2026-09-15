# Harness 扩容会话 — 可直接粘贴的提示词（在任意工作树里开都能用）

用法：把下面 `---` 之后的**全部内容**贴给新会话。它被打开时可能在任何工作树里，
提示词第一节会让它自己找到正确的开发位置。

---

本次任务**不在你当前打开的工作树里执行**。先按第 0 节找到正确位置，再读第 2 节的必读文件，
然后按第 5 节的优先级开始接入第三方 Harness，**能接几家接几家，不设上限**。

## 0. 先找到正确的开发位置（不要在当前树里干活）

你当前所在的工作树是**只读参考**：它是已接入四家 Harness（Pi / Hermes / OpenCode / Codex）
与前后端联调成果的母树，**必须保持干净**——不在里面改文件、不在里面提交、不切换它的分支。

按两步自己找到工作位置：

1. 在**当前树**里读 `docs/implementation/manifest.json`，找 `orders` 中 `id == "43"` 的那条，
   取它的 `worktree` 与 `branch`（预期 `/home/maoqh/projects/agent-box-harness-expansion` 与
   `feature/harness-expansion-v1`）。
2. 切过去并自校验，三条都成立才开工：

   ```bash
   cd /home/maoqh/projects/agent-box-harness-expansion
   git rev-parse --abbrev-ref HEAD     # 期望 feature/harness-expansion-v1
   git status --porcelain | wc -l      # 期望 0
   ls docs/implementation/work-orders/43-harness-expansion.md
   ```

**兜底（目录不存在时重建，不要动母树分支）**：

```bash
git -C /home/maoqh/projects/agent-box-server-round1 worktree add \
  /home/maoqh/projects/agent-box-harness-expansion -b feature/harness-expansion-v1 966c314
```

**若切换失败或校验不通过**：停下来，在回复里报告实际看到的路径、分支与错误，然后问我。
**不要**在当前树里开始实现，也**不要**在当前树里提交任何东西。

## 1. 任务

照抄已接入四家的**全部**做法（注册表条目、生产模块、部署模板、工件构建、假端点全链门、
`--live` 真机门、能力声明、证据与分账），接入**尽可能多**的第三方 Harness。每家开工前先收
官方文档写成"接入卡"，任何一家卡住就记账跳过、不阻塞其它家；能用真实模型验证的就真跑。

## 2. 必读（在**新工作树**里读，不是当前树）

1. `AGENTS.md`
2. `docs/implementation/master-plan.md`
3. `docs/implementation/manifest.json`
4. `docs/implementation/work-orders/43-harness-expansion.md` ← **唯一调度权威**（六件套完成定义、
   接入卡模板、执行协议、阻塞账格式、验收标准）
5. `docs/implementation/status.md`（已接入四家的现状、能力声明与费用分账方式）

## 3. 参考对象（只读，不修改）

- `/home/maoqh/projects/agent-box-server-round1` —— 已接入四家的实现、四个生产门脚本、
  工件构建脚本、两份证据文档。**你的当前工作树很可能就是它**，只读。
- `/home/maoqh/projects/agent-box-desktop-next-wsl-round1` —— 前端仓。只在接入完成后**运行**
  UI 门（`apps/desktop/e2e/p42-ui-model-gate.mjs`，已参数化，换部署即可），**不写任何前端文件**。

## 4. 硬性规则（违反即返工）

- 能力声明**必须有观测证据**，没有就声明 false（四家的 `attach`/`permissions` 是范例）。
- **假端点证据与真实模型证据分账**；未观测项显式记账并给理由，不得静默跳过。
- **不阻塞**：每家 60–90 分钟时间盒；卡住就写阻塞账（命令 / 退出码 / 脱敏错误 / 已排除的可能）
  并立刻跳下一家。绝不放宽断言、伪造证据、把假端点结果说成真实模型结果。
- 真实模型门最后统一串行跑，每家 2 轮（首轮 nonce、次轮回忆）；允许用用户提供的 DeepSeek 密钥
  真跑，累计仍受 **≤¥10** 约束，先按最坏情形预留，逐家记账。
- 不读真实 `~/.codex` 或其它登录态；凭据只读注入，**绝不进 argv / 日志 / 证据 / Git**。
- 不 reset/stash/clean、不 merge main、不 push；只显式 stage 自己的路径；子代理最多两个并行
  且写集不重叠，共享面（注册表、能力表、status、锁、提交）由你串行做。

## 5. 优先级（无上限，按序处理，做完一家再下一家）

1. **DeepSeek Harness（`dsh`）** —— npm `@deepseek-ai/dsh`，MIT，TypeScript，"everything is a plugin"
   （Cordis）；**官方标注 developer preview 且会有破坏性变更**。入口 `dsh web` 起本机 Web UI
   `127.0.0.1:3080`（`--no-open` 不开浏览器）。README 未文档化配置/凭据/续接/协议 —— 去读它的
   `docs/`、`AGENTS.md`、`package.json`、源码把形态判出来（ACP？HTTP/SSE？CLI-headless？），
   **必须钉精确版本**。
2. **Claude Code** —— 注册表已预声明 `driver = "claude"`；ACP 适配器存在，但 38 号调研
   （`docs/server-round1/harness-selection/candidates.md`）记过其 SDK 的许可证问题：先查证，
   查不通就记账跳过。
3. **Gemini CLI / Qwen Code** —— 同上游，有 ACP，npm 固定版本。
4. **Goose（Block）** —— `goose acp`，Rust 单二进制，工件最好固定。
5. **Aider** —— 无 ACP，走 OpenCode 那条中立 driver 接缝；先看有没有 headless/JSON 输出。
6. Crush / OpenHands 等 —— 前五家做完再碰。
   **排除**：闭源 CLI（Cursor / Amp / Droid）、靠终端屏幕解析的、无 resume 语义的。

## 6. 节奏与最终回复

每接入 3 家或每 2 小时：更新 `status.md` / `progress.md`、显式 stage 并提交检查点、清理临时根与
进程。接入卡没写完不要动手；形态判定不出来就记账跳过。

最终回复必须给出：**过门 N 家 / 封装就绪 M 家 / 阻塞 K 家**（各自原因与下一步）、真实模型请求数与
费用累计、清理结果、以及**还没碰的是哪几家**。不允许只报"接了几家"而不给未完成项。
