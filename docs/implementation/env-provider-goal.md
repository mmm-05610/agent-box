# 环境 provider 会话 — goal 开头提示词（新 worktree 用）

把这整段交给新会话即可（工作树：`/home/maoqh/projects/agent-box-env-provider`，
分支 `feature/env-provider-v1`）。

---

你在 AgentBox 的独立工作树里工作。任务：**把 `local` 与 `ssh` 两种"放置"从
"声明了取值、没有实现者"变成端到端可跑**，且不破坏既有分层与既有门。

先自己找到正确的位置（你被开在别的目录里，这是正常的）：

```bash
git -C /home/maoqh/projects/agent-box-server-round1 worktree add \
    /home/maoqh/projects/agent-box-env-provider -b feature/env-provider-v1 <manifest 里 44 的 baseline>
```

（若该路径已存在就直接用；`docs/implementation/manifest.json` 的 44 条目给出 baseline、
write_paths 与只读仓列表。）

然后完整读取并严格执行（顺序）：

1. `AGENTS.md`
2. `docs/implementation/master-plan.md`
3. `docs/implementation/manifest.json`（44 条目是你的调度权威）
4. `docs/implementation/work-orders/44-environment-providers.md` ← **本工单**
5. `docs/implementation/status.md`（了解已经落地了什么）

只读参考（不修改）：`/home/maoqh/projects/agent-box-server-round1`（放置解析、本机通道、
替换门的实现与证据）与 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1`（前端仓）。

**第一优先级不是写 provider，而是让 Worker 能在 SSH 实验机上起来**：工单 §4 已实测
远端 glibc 2.32，而当前 Worker 二进制需要 GLIBC_2.39——先按 §4 的三条路解决（musl 静态构建
优先），起来之后再写 provider。三条都不可行就记账跳过 ssh，把 local 做完，**不得放宽门凑数**。

允许：只读子代理调研（最多两个并行，写集不重叠）；共享面（放置解析、workspaces service、
注册表、status、提交）只能由你串行做。

硬性规则（违反即返工）：

- 真实模型调用**默认零**：全部用 loopback 假端点；确需真实调用必须先取得明确授权，且受 ≤¥10 约束。
- SSH 私钥只作 locator（`/home/maoqh/.ssh/maomaokingdom.pem`），**绝不复制进仓库/工作树/文档，
  绝不进 argv/日志/证据/Git**；报告只写路径与权限位。
- **同一份部署文档**必须同时用于 local 与 ssh（不得为它们加宿主路径或新字段）。
- 放不下来就**类型化拒绝**，不得静默换地方；没有观测证据的能力一律声明 false。
- 不 reset/stash/clean、不 merge main、不 push；父仓与前端仓只读。

两条门是验收核心：`local-env-gate`（**经放置解析**创建 local 工作区 → 一轮对话 → 捕获 → 清理）
与 `ssh-env-gate`（同一流程在远端执行）。四家既有假端点门（Pi/Hermes/Codex/OpenCode）与全量
套件必须不退化（基线 `886 passed / 6 skipped`）。

最终报告必须给全：过门 N 项 / 部分 M 项 / 阻塞 K 项（逐条原因）、回归结果、费用与请求数、
清理证据、未做项，以及 `ENV_PROVIDERS_DONE` 或诚实的 `ENV_PROVIDERS_PARTIAL`。
