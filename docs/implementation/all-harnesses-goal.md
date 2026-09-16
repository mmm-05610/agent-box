# 44 + 45 + 46 goal 开头提示词（2026-09-16 更新版，取代旧的两段）

用途：粘给 `/home/maoqh/projects/agent-box-env-provider` 那条会话，**整段替换它的 goal**。
三单顺序做完：44（环境 provider）→ 45（原生目录存储）→ 46（全部 Harness 装一台 + 逐家全栈联调）。

---

```text
你在 AgentBox 的环境 provider 工作树里持续工作，不得在局部阶段提前结束。

工作树：/home/maoqh/projects/agent-box-env-provider
分支：feature/env-provider-v1
只读参考：父工作树 /home/maoqh/projects/agent-box-server-round1、
         扩展工作树 /home/maoqh/projects/agent-box-harness-expansion（合并时只读它的分支）、
         前端仓 /home/maoqh/projects/agent-box-desktop-next-wsl-round1

三张单，按顺序做完，中间不停。每张单的文档都以父工作树的现行版本为准，先复制进自己的工作树
（父工作树只读；把 `git -C /home/maoqh/projects/agent-box-server-round1 rev-parse HEAD`
记进你的提交信息）：

  P=/home/maoqh/projects/agent-box-server-round1
  mkdir -p docs/implementation/work-orders
  cp $P/docs/implementation/work-orders/45-native-home-storage.md docs/implementation/work-orders/
  cp $P/docs/implementation/work-orders/46-all-harnesses-fullstack.md docs/implementation/work-orders/
  cp $P/docs/server-round1/native-home-storage-landing.md docs/server-round1/
  cp $P/docs/implementation/native-home-storage-goal.md docs/implementation/
  cp $P/docs/implementation/all-harnesses-goal.md docs/implementation/
  # 45 与 46 的 manifest 条目文本分别在各自工单的末尾（45 §9；46 见 manifest 的 46 条目），
  # 加进你自己的 manifest，基线写你的实际提交

【第一步：44 环境 provider】docs/implementation/work-orders/44-environment-providers.md
  目标：local 与 ssh 两种"放置"从"声明了取值、没有实现者"变成端到端可跑；不破坏既有分层与既有门。
  SSH 第一优先级是让 Worker 能在实验机起来（远端 glibc 2.32 vs Worker 需要 2.39，musl 静态优先）；
  三条路都不可行就记账跳过 ssh、把 local 做完，不得放宽门凑数。
  终态：ENV_PROVIDERS_DONE 或诚实的 ENV_PROVIDERS_PARTIAL。

【第二步：45 原生目录存储】docs/implementation/work-orders/45-native-home-storage.md
（设计依据 docs/server-round1/native-home-storage-landing.md，§12 是 F4 与 G8）
  目标：Profile 的原生状态从"每轮上传/下载的状态包"改成跑它的那台机器上的原生目录，该目录成为
  这部分事实的唯一来源；控制面 SQLite 只留记录 + 引用（native_platform、home_locator、native
  session id、审计 manifest 摘要），不存原生字节；同一 Profile 多轮可并行且互不覆盖（直挂，不复制回写）。
  阶段 A（Worker home 操作族 + 协议 3→4 + bundle c9）→ B（房间与两个通道）→ C（记录与审计，
  manifest schema 3、+2 列）→ D（本机门）→ E（WSL/Windows 与四家回归）。
  门 G1–G8，G1–G5 必过；G8 = F4（取消不再丢上下文）：发一条 → 中途取消 → 再发一条问
  "上一条说了什么"，必须能看到那句输入。
  终态：NATIVE_HOME_STORAGE_DONE 或诚实的 NATIVE_HOME_STORAGE_PARTIAL。

【第三步：46 全部 Harness 装一台 + 逐家全栈联调】docs/implementation/work-orders/46-all-harnesses-fullstack.md
  目标：① 一份部署文档装全部 8 家（codex / claude-code / opencode / hermes / dsh / qwen / kilo / pi），
  同一 Server 进程内并存；② 逐家在真实 UI 路径上跑通一轮（真实 Windows Electron → Server →
  wsl.exe → release Worker → bwrap → harness，真实 DeepSeek）；③ 找问题、修问题；复杂问题记录；
  ④ 补文档（逐家矩阵、费用账、清理证据、问题清单）。
  前置：**用户 2026-09-16 显式授权**一次合并——把扩展分支并进来：
      git -C /home/maoqh/projects/agent-box-harness-expansion status --porcelain   # 必须 0 行
      git -C /home/maoqh/projects/agent-box-env-provider merge feature/harness-expansion-v1
  冲突原则：扩展的 harness 代码照收；44/45 改过的接缝以本分支为准，把扩展的同类改动重放到新接缝上，
  不得丢任一方的缺陷修复。合并后必须复跑 8 家注册表测试、扩展的假端点门、45 的 G1–G8。
  任务：A 安装集产出器（scripts/server-round1/harness-install-set.py：逐家构建/校验工件 + 生成部署
  条目与模型文档 → 一份 deployment.json + install-set.json，零宿主路径、幂等可复跑）；
  B 一份文档起 Server + UI 里 8 家可见可选；C 逐家跑
  `apps/desktop/e2e/p42-ui-model-gate.mjs <family>`（真实 DeepSeek，逐笔记账）；
  D 隔离与交叉反例（HOME 隔离、A 家密钥在 B 家拿不到、home 互不覆盖）；E 收口。
  门 G1–G6（见工单 §0）。终态：ALL_HARNESSES_FULLSTACK_DONE 或诚实的 ALL_HARNESSES_FULLSTACK_PARTIAL。

三张单共用的硬性规则（违反即返工）：

- 不碰 wire：28 方法、wire/1、TS 与生成工件摘要不变；不加事件 kind、不改事件载荷。
- 前端仓只读（e2e 脚本可以跑、参数走 env，不得改前端源码）。
- 宿主绝对路径不进记录、不进部署文档（部署文档零宿主路径，走 --mount 令牌）。
- 只读配置 / tmpfs 遮蔽 / 受保护路径三条规则一条不放松；45 起 home 出现注入值 = 类型化失败 +
  删掉命中的那个文件 + 记账。
- **真实模型调用：46 已获用户授权**（用户 2026-09-16：允许使用他提供的 DeepSeek API，"不用害怕
  限制"，目标是找问题）。仍然逐笔记账（每家请求数 + 估算费用），只走真实 UI 路径门，每家用最小
  轮次；不得把"放宽限制"当成"可以随便重跑"。44/45 仍默认零真实调用（loopback 假端点）。
- 凭据只作 locator：`/home/maoqh/.agentbox-acceptance-secret.CnsAonj6/deepseek-api-key`（0600）
  与用户经 UI 录入的那条；绝不读取真实 ~/.codex 等登录态；绝不打印、不落盘到仓库、
  不进 argv/日志/证据/Git；报告只写路径、权限位与"零泄漏"事实。
- SSH 私钥只作 locator（/home/maoqh/.ssh/maomaokingdom.pem），绝不复制、绝不进 argv/日志/证据/Git。
- 每一家的原生二进制/闭包摘要固定，摘要不符即拒绝，不得替换版本。
- 复杂问题（需合同变更 / 需用户裁决 / 需新授权 / 需前端改动）记录并停下该部分，不得自行放宽断言、
  不得自建代理或改端点绕过去；"这台 Server 装了哪几家"缺上行面这一条按 46 §6 记录并交裁决。
- 没有观测证据的能力一律声明 false；类型化拒绝优先于静默换地方。
- 不 reset/stash/clean、不 merge main（唯一允许的合并是 46 §1b 那一次）、不 push；
  父工作树与扩展工作树只读；不把 env-provider 分支合并回父分支（那是之后用户裁决后的单独一步）。

每阶段结束提交一次并写清检查点；status 分账由你维护（docs/implementation/status.md）。

最终必须给出三份完整报告（44 / 45 / 46 各按自己工单的报告格式），并给出三个结论：
  ENV_PROVIDERS_DONE 或 _PARTIAL；
  NATIVE_HOME_STORAGE_DONE 或 _PARTIAL；
  ALL_HARNESSES_FULLSTACK_DONE 或 _PARTIAL（附逐家矩阵与问题清单）。
不得用一份报告冒充三份，不得用局部通过冒充整门通过，不得用假端点结果冒充真实模型结果。
```
