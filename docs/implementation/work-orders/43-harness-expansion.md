# 43 — Harness 扩容：按优先级尽可能多地接入第三方 Harness

状态：**READY_TO_DISPATCH**（用户 2026-09-15 授权；无数量上限，按优先级处理，能接几家接几家）
适用工作树：新 worktree `agent-box-harness-expansion`，分支 `feature/harness-expansion-v1`，从
`agent-box-server-round1` 当前 HEAD 拉出。**只读**参考原工作树与前端仓，不继承 Reviewer 锁。

## 0. 一句话

照抄已经接入的四家（Pi / Hermes / OpenCode / Codex）的**全部**做法，接入**尽可能多**的第三方
Harness；每接一家先收官方文档再动手，任何一家卡住就记账跳过、不阻塞其它家；能用真实模型验证的
就真跑，费用仍受 42 §D 的累计上限约束。

## 1. 权威与边界

每阶段开始/结束、最终回复前读：`AGENTS.md`、`docs/implementation/master-plan.md`、
`docs/implementation/status.md`、`docs/implementation/manifest.json`、本文件。

不变式（违反即返工）：
- Work Core provider-neutral；**Server 不解释原生协议**，插件拥有 Harness 原生语义；不往 UI 塞
  Harness 特例；不绕 Worker/bwrap 直接跑 Harness。
- **能力声明必须有观测证据**；没有证据就声明 false（四家里的 `attach`/`permissions` 是范例）。
- **假端点证据与真实模型证据分账**，不得互替；未观测项必须显式记账并给理由。
- 不读用户真实 Harness HOME 或登录态；不读旧凭据；不改前端仓（UI 门只跑，不改）。
- 不 reset/stash/clean、不自动 merge main、不 push；只显式 stage 自己的路径。

## 2. 候选名单与优先级（无上限，按序处理）

| 优先 | Harness | 已知形态 | 第一步 |
| --- | --- | --- | --- |
| 1 | **DeepSeek Harness（`dsh`）** | npm `@deepseek-ai/dsh`（MIT、TypeScript、Cordis 插件体系）；`dsh web` 起本机 Web UI `127.0.0.1:3080`（`--no-open`）；**README 未文档化配置/凭据/续接/协议**；官方标注 developer preview、会有破坏性变更 | 读它的 `docs/`、`AGENTS.md`、`package.json`（bin/engines）、plugin 体系与源码，判定有没有 headless/HTTP/ACP 形态；**必须钉住精确版本** |
| 2 | **Claude Code** | 注册表 `driver = "claude"` 已预声明；ACP 适配器 `@agentclientprotocol/claude-agent-acp` 存在 | **先查许可证**（38 号调研记过其 SDK "all rights reserved"），查不通就记账跳过 |
| 3 | **Gemini CLI / Qwen Code** | 同上游；有 ACP；npm 固定版本 | 选一家先做（Qwen Code 更可能直连 OpenAI 兼容端点） |
| 4 | **Goose（Block）** | `goose acp`；Rust 单二进制 | 单二进制 → 工件最好固定 |
| 5 | **Aider** | **无 ACP**，需中立 driver 接缝（OpenCode 先例） | 先看它是否有可编程的 headless/JSON 输出 |
| 6 | Crush / OpenHands / 其它 | headless 为主、programmatic 弱 | 只在前五家做完后碰 |
| — | Cursor / Amp / Droid CLI 等闭源、terminal-screen 解析类、无 resume 语义类 | — | **直接排除**，不要浪费时间 |

38 号调研（`docs/server-round1/harness-selection/candidates.md`）已有十几家的评估表，动手前先读，
避免重复调研；其中 Mjolnir 那条提到过 "DeepSeek" 这一家的存在。

## 3. 每家的接入卡（动手前必须写完）

一条 30–60 行的卡片，全部来自**官方文档/仓库/`--help` 只读探测**，不许猜：

```
harness:            <名字与版本>
来源与许可:          <仓库/npm 包/二进制 + license>
安装与钉版:          <精确版本或 digest；两次安装/构建是否摘要一致>
入口形态:            <ACP / app-server / HTTP+SSE / CLI-headless / TUI-only>
配置入口:            <配置文件路径 + 字段；或环境变量>
凭据变量:            <env 名；是否支持 api-key；是否强制登录态>
模型配置:            <模型目录/控件；能否指向 OpenAI 兼容端点>
会话与续接:          <native session id 从哪来；resume/load 语义与入口>
流式与终态:          <增量通道；如何判定一轮结束；stop/cancel 语义>
审批/附件:           <是否支持；支持才声明能力>
状态目录:            <哪些文件属于 native state；能否只投影子目录>
形态判定:            <走 ACP 模板 / app-server 模板 / 自写 driver；理由一句话>
未知项:              <还没搞清的点 + 计划怎么搞清（读哪个文件/哪个命令）>
```

**形态未定就不要开始写代码**：先补文档或只读探测；仍不定则记入阻塞账并跳到下一家。

## 4. 六件套完成定义（DoD，照抄四家）

1. **注册表**：`plugins/agent-box-harnesses/src/agent_box_harnesses/harnesses.toml` 新增
   `[[harness]]`（driver、capabilities、identity、executable、profile、inputs、launch_modes、
   runtime、continuation、credential），并更新 `tests/test_capability_declarations.py` 的
   `FAMILY_MATRIX`。
2. **生产模块**：`agent_box_harnesses/<family>/production.py`——工件挂载、投影文件、
   `stateProjection`（含 `.tmp`/快照类易变路径则用 `ephemeralPaths`）、`credentialKind/Environment`、
   模型控件、能力声明，并能 `--out` 出部署 JSON。
3. **部署模板**：`deploy/<family>/`——原生配置与目录，全部为**非秘密**内容。
4. **工件构建**：`scripts/server-round1/build-<family>-runtime-artifact.mjs`——钉版本/锁；
   **两次构建摘要一致**；输出在仓库外；manifest 带 tree digest。
5. **生产门**：`scripts/server-round1/<family>-production-chain-gate.py`——假端点全链门
   （真实 Worker + bwrap + 真实 adapter）+ `--live` 付费模式（官方端点、凭据只读注入、绝不入
   argv/日志/证据、未观测项显式记账）。照抄现有四家门的结构与错误码风格。
6. **证据与分账**：`docs/server-round1/fullstack/<family>-production-packaging.md` +
   `status.md`/`progress.md` 的独立条目与费用记账；**UI 门**随后用现成的
   `apps/desktop/e2e/p42-ui-model-gate.mjs`（已参数化，换部署即可；只跑不改）。

六件套齐 = 该家"过门"；只到 1–4 = "封装就绪、未过门"，必须如实标注。

## 5. 执行协议（不阻塞是硬要求）

1. **先并行收文档**（只读子代理，最多两个并行）：每家产出一张 §3 的接入卡。
2. **按形态分批**：ACP 批 → app-server/HTTP 批 → 自写 driver 批。同批内两家并行，**写集不重叠**；
   共享面（注册表、能力表、status、锁文件、两仓提交）由主执行者**串行**做。
3. **每家 60–90 分钟时间盒**。超时或卡住 → 记入阻塞账（命令、退出码、脱敏错误、卡在哪一步）→
   **立刻跳下一家**。不得为了凑数放宽断言、伪造证据、把假端点结果当真实模型结果。
4. **真实模型门最后统一串行跑**：每家 2 轮（首轮 nonce、次轮回忆），沿用 42 §D 的同一 locator
   与 ≤¥10 累计上限，先按最坏情形预留；**已发生费用与请求数逐家记账**。
5. 每接入 3 家或每 2 小时：更新 status/progress、提交检查点（显式路径）、清理临时根与进程。

## 6. 阻塞账格式（写进证据文档）

```
| harness | 卡在哪一步 | 命令 | 退出码 | 脱敏错误/现象 | 已排除的可能 | 下一步 |
```

## 7. 验收（本工单结束条件）

- 每家：注册表 + 生产模块 + 模板 + 工件（双构建一致）+ 假端点门 exit 0；能跑 `--live` 的跑
  `--live` 并 exit 0（未跑的要写明理由）。
- 能力声明逐项有观测证据，无证据项为 false。
- 费用账准确（请求数、tokens 上界、累计人民币），未超 ¥10、未充值。
- 临时根/进程/worker 投影清理干净（用 `--keep` 的根要按属主核对后删除）。
- status/progress 反映真实状态：过门的家、未过门的家与原因、阻塞账。
- 最终如实给出："本轮接入 N 家过门、M 家封装就绪、K 家阻塞"，不夸大。

## 8. 明确不做

- 不改前端仓、不改 wire 合同（若某家确需合同增补，停下来写清需求，不在本工单内擅自改锁）。
- 不做 UI 控件路径驱动（那是另一件事，已有独立记录）。
- 不为单家 Harness 在 Server/Core 增加品牌分支；一切原生语义留在插件内。
