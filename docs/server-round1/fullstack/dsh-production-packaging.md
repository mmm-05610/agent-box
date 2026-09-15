# DeepSeek dsh 生产封装（Work Order 43）

状态：**DSH_PRODUCTION_CHAIN_PREPARED / MODEL_NOT_VERIFIED（封装轮）**；
真实模型结论见文末「真实模型门」一节（跑完后补记，未跑则显式写明理由）。

这是 Work Order 43（Harness 扩容）按已接入四家（Pi/Hermes/OpenCode/Codex）的全部做法
接入的第一家。六件套：注册表、生产模块、部署模板、工件构建（双构建一致）、生产门
（假端点全链 + `--live`）、本证据文档与 status 分账。

## §1 接入卡（动手前完成；全部来自官方只读探测）

```
harness:            DeepSeek Harness `@deepseek-ai/dsh` 0.1.5-rc.1（npm latest 标签，
                    2026-09-10 发布；bin `dsh`→`lib/bin.js`；engines 未声明，代码使用
                    node:sqlite ⇒ Node 22+；本机 /usr/bin/node = v22.23.2）
来源与许可:          GitHub deepseek-ai/deepseek-harness；registry license=MIT；
                    tarball 内 LICENSE 核验 "Copyright (c) 2026 DeepSeek"（MIT）
安装与钉版:          dist.integrity sha512-rmNmzQCg3oIc1z8xH7izRSOuy1TNzq+/NILyfM+7e8DKOy
                    V+yBtg47WEsqR2SiIe1ATec3L/rUa1YhIcfQ2XEg==；独立 runtime-dsh 根
                    package-lock 锁定全部闭包；两次构建摘要一致（见 §4）
入口形态:            ACP（一等）：`dsh --profile acp` 官方 ACP v1 stdio 服务器
                    （initialize/authenticate/session new|list|resume|close|prompt|
                    cancel/set_config_option/request_permission；@agentclientprotocol/
                    sdk 1.4.0）。另有 headless 一次性 profile 与 web GUI（内部协议，
                    不作 driver）
配置入口:            home 根 = $DSH_HOME > ~/.dsh；settings 文档（YAML/JSON）按
                    namespace 存用户段；`llm-deepseek:` 段可免重启改 baseURL/模型
凭据变量:            DEEPSEEK_API_KEY（apiKeyEnv 可改；启动 env 优先级最高；无强制
                    浏览器登录态）
模型配置:            路由 provider `deepseek-official`；model id 直接透传到 wire；
                    默认目录含 deepseek-flash；baseURL 默认 https://api.deepseek.com，
                    $DEEPSEEK_BASE_URL 或 settings 覆盖
会话与续接:          $DSH_HOME/sessions（session.v2.jsonl[.zstd] + flock）；
                    ACP session/list + session/resume（跨进程；resume 不重放历史；
                    session/load 不支持）
流式与终态:          provider 走 SSE；ACP session/update 语义更新；prompt 以 quiescence
                    （Agent 空闲 + 更新排空 + 持久化 flush）结算并给 stopReason；
                    session/cancel 取消
审批/附件:           request_permission 在 ACP 面存在（未观测到运行时裁决 ⇒ 不声明
                    permissions）；附件未见投递证据 ⇒ 不声明 attach
状态目录:            $DSH_HOME/{profiles,settings.yaml,.credentials.yaml,.env,
                    cordis.patch.yml,sessions,.agent-presets}；生产投影只把
                    sessions/ 作为有界 RW state，其余为只读配置或不存在
形态判定:            走 ACP 模板（Pi/Hermes 同路）：官方一等 ACP stdio 面 + 标准
                    语义更新 + resume 续接，与现有 sidecar 的 ACP 注册完全同构
未知项:              (a) 重试策略取值未从源码确证（声明默认 normal/5 次重试）——门内
                    以"两轮恰 2 次请求"预算守卫实测；(b) ACP create 传 model 后
                    实际生效值——门内以假端点收到的 model 字段直接观测；
                    (c) 启动期是否有网络外呼——门内以 loopback guard 实测
```

风险记账：0.1.x 为 developer preview（官方标注会有破坏性变更），发版频繁；已用
精确版本 + lockfile + 双构建摘要一致钉死；后续升级需重跑本门。

## §2 注册表与能力声明

- `harnesses.toml` 新增 `[[harness]] driver="dsh"`：静态候选 capabilities =
  `start/observe/finish/stream/native_continuation`（**未声明** attach/permissions/
  steer：无任何运行时证据）。
- `runtime/capability_declarations.json` 同步投影；`tests/test_capability_declarations.py`
  的 `FAMILY_MATRIX` 增加 dsh 行（observed 列在门跑完后按证据回填）。
- 注册胶水 `runtime/profile_extensions.mjs` 新增 `dsh` profile（与 Hermes 同为
  AgentBox 自有 glue，上游 harness-remote 无此 profile；`permissionMode: "deny"`）。
- 模型别名：`AGENTBOX_MODEL_ALIASES.dsh = {"deepseek-flash": "deepseek-official/deepseek-flash"}`
  ——dsh 的 ACP `model` 配置项播发 `provider/model` 形态的可选值（README "opaque
  provider/model choices"），桥的 `setModel` 先精确匹配、再按 `/` 后缀匹配，别名把
  产品 id 对到播发值；别名与 `production.py` 的 `NATIVE_MODEL_VALUE` 由测试逐项断言
  相等，不能漂移。

## §3 生产模块与部署模板（非秘密）

- `src/agent_box_harnesses/dsh/production.py`：与 Pi 同构的数据模板——官方根
  `https://api.deepseek.com`、产品模型 `deepseek-flash`、native 值
  `deepseek-official/deepseek-flash`、输出上限 64 tokens、thinking 关闭、
  `credentialKind=api-key`/`credentialEnvironment=DEEPSEEK_API_KEY`、
  `DSH_HOME=/runtime/home/.dsh`、state 只投影 `sessions/` 子目录。
- `deploy/dsh/settings.json`：settings 文档选 JSON 格式（dsh-settings-file 原生支持
  `.json`，避免为模板引入 YAML 依赖）；`llm-deepseek` namespace 段。
- loopback 假端点变体 = 同一文档仅替换 `llm-deepseek.baseURL`（`documented_differences`
  断言唯一差异字段），生产模板本身永不改写。

## §4 工件构建（双构建一致）

- `runtime-dsh/` 独立依赖根：**刻意不进共享 `runtime/`**——dsh 依赖
  `@agentclientprotocol/sdk@1.4.0`，与共享根钉死的 1.3.0 override 冲突；独立根保证
  四家既有工件的锁与摘要不受任何影响。
- `scripts/server-round1/build-dsh-runtime-artifact.mjs`：照抄 Pi 构建器的全部规则
  （Node 解析序闭包、lock 逐包版本相等、运行时文件过滤、无符号链接/特殊文件、
  排除其他家族适配器、Python 侧 digest 复核、只读发布、仓库外输出），常量与错误码
  前缀换成 DSH。
- 两次构建 tree digest 一致的证据：门跑时记录（见 §5 报告）。

## §5 生产门（假端点全链 + --live）

- `scripts/server-round1/dsh-production-chain-gate.py`：照抄 Pi 门结构与错误码风格。
  真实 release Worker + bwrap + 真实 `dsh --profile acp`（工件内）+ 本机 loopback
  假端点；两轮同一 Server Session、同一 native id；假端点预算恰 2 次请求；凭据走
  SecretStore→Worker secret frame→sidecar env；全报告凭证扫描。
- 与 Pi 的两点刻意差异（都是 dsh 的观测事实，不是猜测）：
  1. **重开相位不重放**——dsh 只支持 `session/resume`（README：resume 不重放历史；
     session/load 明确不支持），故重开断言是"同 native id + 重开相位零重放 + 第二轮
     请求体带首轮上下文"，与 Hermes 的 `resume` 观测同型，**不是** Pi 的 replay 断言。
  2. 进程清理的 pgrep 模式与构建器常量换成 dsh。
- **门结果（2026-09-16，exit 0，`DSH_PRODUCTION_CHAIN_GATE_OK`）**：
  - 工件：520 包 / 14353 条目 / 132 128 584 字节 / tree digest
    `sha256:d8f5e0c1baeb203682e9c06aa486825cd3273c8aa9a6ea031c6393eca35d42aa`；
    **双构建摘要一致**（同一 lock，两次构建 digest 相等）；source lock digest
    `sha256:11a37afe3732b2f85a4e0d4c1e33f14ba789dd654b9e800157876eb38e5af0d4`。
  - Worker：本工作树从 `workers/` 源码新鲜构建的 release bundle
    （`sha256:b4b58db16159b4e3518f33dff9745effd5f7f5f80e61e8373055a7499de4a37a`，
    wireVersion=1）。与 42 记录的 c8 摘要 `sha256:514f48a9…` 不同源的是**构建工具链**
    （rustc 版本差异），Worker 源码与 c8 修复后的源码同源；此处如实记录本次构建
    摘要，不冒充 c8。
  - 主链两轮：第一轮 completed（deltaSeq [4] < completedSeq 7）、第二轮 completed
    （[11] < 14）、`checkpointNativeIdStable=true`；checkpoint：schema v2、
    `resumable=true`、native session id `f686b9a1-…`、state 文件
    `session.lock + session.v3.jsonl.zstd`（2 文件 / 21 056 字节）。
  - 模型选择：假端点两次收到的 `model` 均精确为 `deepseek-flash`；模型别名指向
    dsh 实际播发的 opaque 值 `["deepseek-official","deepseek-flash"]`（第一手
    `session/new` 探测；显示名 DeepSeek-V41-Flash）。
  - 未知模型：`deepseek-unknown` 在任何 provider 请求前被拒
    （`providerRequestsAfterRefusal=0`，拒绝原因 "Harness model is not available"）。
  - 凭据：注入 token 恰好到达假端点（`injectedTokenReachedProvider=true`，
    `unauthorizedRequests=0`）；events / 可报告状态 / native state 扫描零命中
    （`tokenInState=false`，2 文件 21 KB）。
  - egress guard：adapter 进程内已加载、零拒绝记录；loopback 覆盖只改
    `llm-deepseek.baseURL` 一个字段。
  - 重开相位：`nativeSessionIdStable=true`、`replayedStoredTurn=false`（dsh 的
    resume 不重放——出现重放反而是异常）、`round2RequestCarriedRound1Context=true`。
  - 清理：临时根 removed=true、worker 投影/adapter 进程/gate token 全部清零。
- **桥接补丁（照 40-A 先例登记）**：`bridge/src/acp-service.js` 的 `setModel` 只做
  平铺精确匹配，而 dsh 的 model 选项是**分组**结构（组头 + 嵌套 options），任何
  模型选择都会以 "Harness model is not available" 失败。已打**harness 中立**补丁：
  匹配前对嵌套 `options` 展平一层；不改变选择仍以 dsh 自己的 opaque 值经
  `session/set_config_option` 下发。登记于 `third_party/harness_remote/PATCHES.md` §3
  与 `SOURCE.json`（`patched_sha256=00b739b4…`）。
- `--live`：**未执行**（按工单 §5.4 最后统一串行；见 §6）。

## §6 真实模型门（--live，付费，最后统一串行）

- 状态：**未执行**（按工单 §5.4 最后统一串行）。执行后在此记：轮数、请求数、
  tokens 上界、费用、结果码；未执行则记明理由。

## §7 阻塞账

| harness | 卡在哪一步 | 命令 | 退出码 | 脱敏错误/现象 | 已排除的可能 | 下一步 |
| --- | --- | --- | --- | --- | --- | --- |
| （暂无） | | | | | | |
