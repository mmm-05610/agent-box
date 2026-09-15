# Qwen Code 生产封装（Work Order 43）

状态：**QWEN_PRODUCTION_CHAIN_PREPARED / MODEL_NOT_VERIFIED（封装轮）**；
真实模型结论见文末「真实模型门」一节。

Work Order 43 接入的第三家（优先级 3）。六件套照抄已接入家族的全部做法。

## §1 接入卡（动手前完成；官方文档 + tarball 只读探测 + 第一手 ACP 探测）

```
harness:            Qwen Code `@qwen-code/qwen-code` 0.23.4（npm latest；bin
                    `qwen`→cli-entry.js；engines node>=22；完全 bundled、运行时
                    零依赖；optional 平台包 15 个中本平台相关者入闭包）
来源与许可:          GitHub QwenLM/qwen-code；tarball LICENSE = Apache-2.0
                    （package.json 无 license 字段——以 LICENSE 文件为准，已记账）
安装与钉版:          独立 runtime-qwen 根 package-lock（50 条目）；dist.integrity
                    sha512-qrM7Lwp9S6LfIx8Mh9sAr4aBPyUa9W0k72uOQJPsJ6Z8ClAzoEQzkdLD
                    1TrchioJicgSckM1PLyendibyXHElA==（代理以 registry tarball 本地
                    重算一致）；双构建摘要一致 sha256:5984481c…（13 包/1171 条目/
                    136 859 126 字节）
入口形态:            ACP v1 stdio：`qwen --acp`（稳定 flag；--experimental-acp 已弃用）
配置入口:            环境变量优先于 settings；连接事实全走 env（第一手探测验证）
凭据变量:            OPENAI_API_KEY（或内置 deepseek preset 的 DEEPSEEK_API_KEY；
                    本部署用通用 openai 协议三件套）；不强制 OAuth（ACP 只暴露
                    openai/openai-responses 两个 auth method）
模型配置:            OPENAI_MODEL=deepseek-flash；适配器 model 配置项播发运行时
                    合成值 `$runtime|openai|deepseek-flash(openai)`（第一手观测）；
                    线上 model 字段精确 deepseek-flash、POST /chat/completions
会话与续接:          QWEN_HOME/projects/<dir>/chats/<id>.jsonl；ACP session/
                    load|list|resume 原生支持；门实测重开记录法（见 §5）
流式与终态:          session/update（agent_message_chunk 实测）；stopReason end_turn
审批/附件:           request_permission/set_mode 配置面存在；本链未观测到运行时
                    权限裁决 ⇒ 不声明 permissions；无附件面 ⇒ 不声明 attach
状态目录:            QWEN_HOME 整体重定向；生产 state 只投影 projects/ 子树
                    （chats 所在）；settings.json 由 harness 自持（见 §3 发现）
形态判定:            走 ACP 模板（dsh 同构，OpenAI 协议假端点）
未知项:              (a) getSessionRuntimeBaseDir 精确路径未钉死（state 内观测到
                    memory/meta 等文件一并回投，行为符合预期）；(b) auto/plan 审批
                    模式 ACP 语义未逐行核验（未声明 permissions，不影响本链）
```

## §2 注册表与能力声明

- `harnesses.toml` 新增 `[[harness]] driver="qwen"`：静态候选
  `[start, observe, finish, stream, native_continuation]`；attach/permissions/
  steer 不声明。`capability_declarations.json` 同步；FAMILY_MATRIX 增加 qwen 行。
- 注册胶水：AgentBox 自有 `qwen` profile（上游 harness-remote 无此条目；
  `permissionMode: "deny"`）。
- 模型别名：`AGENTBOX_MODEL_ALIASES.qwen = {"deepseek-flash":
  "$runtime|openai|deepseek-flash(openai)"}`——桥的 setModel 精确匹配该播发值；
  别名与 `production.py` 由测试锁定。

## §3 生产模块与部署模板（非秘密）+ 一条第一手发现

- `src/agent_box_harnesses/qwen/production.py`：官方根 `https://api.deepseek.com`、
  产品模型 `deepseek-flash`、native 值为上述运行时合成串、
  `credentialEnvironment=OPENAI_API_KEY`、`QWEN_HOME=/runtime/home/.qwen`、
  state 投影 `projects/` 子树。ADAPTER_ENVIRONMENT 三件套 =
  `QWEN_HOME` + `OPENAI_BASE_URL`（官方）+ `OPENAI_MODEL`（产品 id）。
- **第一手发现（决定模板形态）**：qwen 首启会对 settings.json 做**写回归一化**
  （备份 + rename .orig），只读投影以 EBUSY 失败。因此本家族**不投影任何原生
  配置文件**：连接事实全部走环境（探测验证），settings 由 harness 在隔离 home
  内自持（该路径在 state 投影 `projects/` 之外，不进 checkpoint）。测试锁定
  `projection_files() == ()`。
- loopback 假端点变体 = adapter 环境仅替换 `OPENAI_BASE_URL` 一个键
  （`documented_differences` 断言唯一差异键）。

## §4 工件构建（双构建一致）

- `runtime-qwen/` 独立依赖根；`scripts/server-round1/build-qwen-runtime-artifact.mjs`
  为 dsh 构建器克隆（同闭包规则/lock 权威/过滤/摘要/只读发布/仓库外输出）。
- 双构建摘要一致：`sha256:5984481c61b5056d4ef86420f095993efb43bc89d0a6d965f3b5e40a02c7e793`
  （13 包 / 1171 条目 / 136 859 126 字节）；source lock digest
  `sha256:490d5c2691cab8ee41e23fc42371d3b6107016d75…`（完整值见门 manifest）。

## §5 生产门（假端点全链 + --live）

- `scripts/server-round1/qwen-production-chain-gate.py`：dsh 门克隆（同一
  OpenAI 协议假端点）。**门结果（2026-09-16，exit 0，`QWEN_PRODUCTION_CHAIN_GATE_OK`）**：
  - 主链两轮：completed（deltaSeq [4] < completedSeq 7、[11] < 14）、
    `checkpointNativeIdStable=true`、checkpoint schema v2 `resumable=true`、
    native session id `73260d9e-…`、state 4 文件（chats jsonl + memory + meta）。
  - 模型选择：假端点两次收到 `model` 精确 `deepseek-flash`、`/chat/completions`。
  - 未知模型：`deepseek-unknown` 发包前被拒（`providerRequestsAfterRefusal=0`，
    "Harness model is not available"）。
  - 凭据：注入 token 恰到假端点、零未授权；events/可报告状态/state 扫描零命中
    （4 文件 5 222 字节）。
  - **egress 守卫**：guardLoaded=true；实测拦截 12 次 qwen 对阿里云 RUM 遥测域名
    （`*.rum.aliyuncs.com`）的 DNS 解析尝试——厂商遥测、全部阻断、零接触，记为
    预期观测（`expectedVendorResolveDenies=12`）；任何其他目的地仍类型化失败。
  - 重开相位：`nativeSessionIdStable=true`、`round2RequestCarriedRound1Context=true`、
    `reopenMethod=session/resume`（记录法，非假设）。
  - 清理：临时根/worker 投影/adapter 进程/gate token 全清（removed=true）。
- `--live`：**未执行**（按工单 §5.4 最后统一串行；见 §6）。

## §6 真实模型门（--live，付费，最后统一串行）

- 状态：**未执行**。执行后在此记：轮数、请求数、tokens 上界、费用、结果码。

## §7 阻塞账

| harness | 卡在哪一步 | 命令 | 退出码 | 脱敏错误/现象 | 已排除的可能 | 下一步 |
| --- | --- | --- | --- | --- | --- | --- |
| （暂无；首启 settings EBUSY 已按 §3 修正——不再投影 settings，属设计修正非阻塞） | | | | | | |
