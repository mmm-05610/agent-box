# 原生目录存储 — goal 开头提示词（本仓内新会话用）

把这整段交给新会话即可。工作树：`/home/maoqh/projects/agent-box-server-round1`，
分支 `feature/server-harness-extension-v1`（**本单不新开工作树**）。

---

你在 AgentBox 的后端工作树里工作。任务：**把 Profile 的原生状态从"每轮上传/下载的状态包"
改成跑它的那台机器上的原生目录，并让该目录成为这部分事实的唯一来源**；控制面（SQLite）只留
记录 + 引用；同一 Profile 的多轮必须能并行且互不覆盖。

先完整读取并严格执行（顺序）：

1. `AGENTS.md`
2. `docs/implementation/master-plan.md`
3. `docs/implementation/manifest.json`（45 条目是你的调度权威）
4. `docs/implementation/work-orders/45-native-home-storage.md` ← **本工单**
5. `docs/server-round1/native-home-storage-landing.md` ← 设计依据（本单不重复它的论证）
6. `docs/implementation/status.md`（了解已经落地了什么）

只读参考（不修改）：`/home/maoqh/projects/agent-box-desktop-next-wsl-round1`（前端仓）与
`/home/maoqh/projects/agent-box-env-provider`（44 的工作树）。共享面（`placement.py`、
`bootstrap/runtime.py`、`execution/sidecar.py`、`docs/implementation/status.md`）与 44 **串行**。

**第一优先级不是改代码，而是确认两件事**（都要第一手证据，写在你的第一份报告里）：

1. Worker 的持久 home 根真的在 `--root` 之外、attempt 结束与 Worker 退出都不删
   （今天 `--root` 是 `/tmp/...` 且退出即删，见工单 §1.3）；
2. 房间把 home 目录 RW 绑到 `/runtime/home/<native_home>` 之后，**只读配置投影与 tmpfs 遮蔽
   依然生效**（bind 顺序按深度升序，越深越晚）。

硬性规则（违反即返工）：

- **不碰 wire**（28 方法、`wire/1`、TS 与生成工件摘要）；**不加事件 kind、不改事件载荷**。
- 宿主绝对路径**不进记录、不进部署文档**：记录只有 `native_platform` + `home_locator`。
- 只读配置 / tmpfs 遮蔽 / 受保护路径三条规则一条不放松；凭据只有每次执行的一次性投影，
  home 零命中（命中 = 失败 + 删命中文件 + 记账）。
- 真实模型调用**默认零**（全部 loopback 假端点）；确需真实调用须先取得明确授权且受 ≤¥10 约束。
- 跑不了的门按工单 §6 记账，**不得放宽断言凑绿**；没有观测证据的能力一律 false。
- 不 reset/stash/clean、不 merge main、不 push；前端仓与 44 工作树只读。

验收核心是 G1–G5 五条门（一轮写目录 / 二轮靠 home 续接且真召回 / 同 Profile 并行不丢 /
凭据与遮蔽 / 不退化：四家全链门 + 全量 `886 passed / 6 skipped` 基线 + Windows r4 用新 bundle），
外加 G6 漂移可见、G7 人手 UI 路径。每阶段结束提交一次并写清检查点。

最终报告必须给全（工单 §7 的格式）：过门逐条、回归计数与退出码、协议版本与 bundle 摘要、
wire 摘要（须与锁定值一致）、manifest schema 3 样例、费用、清理证据、未做项与阻塞项，
以及 `NATIVE_HOME_STORAGE_DONE` 或诚实的 `NATIVE_HOME_STORAGE_PARTIAL`。
