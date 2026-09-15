# Harness 扩容 — goal 开头提示词（短版，直接复制粘贴）

用法：把 `---` 之后的全部内容贴给新会话（它可能被打开在任何工作树里）。
**详细规则都在工单里，不在这段里**。

---

你这次的任务是**按优先级尽可能多地接入第三方 Harness**，照抄已接入四家（Pi / Hermes /
OpenCode / Codex）的全部做法，能接几家接几家，**不设上限**。

**第一步：先找到自己的工作位置**（你当前所在的工作树是只读母树，不在里面干活）

1. 在当前树读 `docs/implementation/manifest.json`，取 `orders` 里 `id == "43"` 的 `worktree`
   与 `branch`（预期 `/home/maoqh/projects/agent-box-harness-expansion` /
   `feature/harness-expansion-v1`）；
2. 切过去并自校验：分支名正确、`git status --porcelain` 为空、
   `docs/implementation/work-orders/43-harness-expansion.md` 在场；
3. 三条不齐就**停下报告**实际路径/分支/错误；**不要**在参考树里实现或提交。目录不存在时重建：
   `git -C /home/maoqh/projects/agent-box-server-round1 worktree add /home/maoqh/projects/agent-box-harness-expansion -b feature/harness-expansion-v1 966c314`

**第二步：读权威文档（在 **新** 工作树里）**

- `AGENTS.md`、`docs/implementation/master-plan.md`、`docs/implementation/manifest.json`、
  `docs/implementation/status.md`
- **`docs/implementation/work-orders/43-harness-expansion.md` ← 唯一调度权威**：候选与优先级、
  接入卡模板、六件套完成定义、执行协议、阻塞账格式、验收标准、明确不做的事

**不可让步的几条（细节见工单）**

- 能力声明**必须有观测证据**，没有就声明 false；假端点证据与真实模型证据**分账**，
  未观测项显式记账给理由。
- **不阻塞**：每家 60–90 分钟时间盒，卡住就记账并立刻跳下一家；绝不放宽断言、伪造证据、
  把假端点结果说成真实模型结果。
- 真实模型门最后统一串行跑（每家 2 轮），可用用户提供的 DeepSeek 密钥，累计 **≤¥10**，逐家记账。
- 只写自己这棵工作树；母树与前端仓**只读**（UI 门只跑不改）；不 reset/stash/clean、
  不 merge main、不 push；只显式 stage 自己的路径。

**收尾**：每接入 3 家或每 2 小时更新 `status.md`/`progress.md` 并提交检查点。最终回复给出
**过门 N 家 / 封装就绪 M 家 / 阻塞 K 家**（各自原因与下一步）、真实请求数与费用、清理结果、
以及还没碰的是哪几家。
