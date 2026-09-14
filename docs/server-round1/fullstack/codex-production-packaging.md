# 42-D Codex 生产封装与本机假端点全链验证

日期：2026-09-14。分支 `feature/server-harness-extension-v1`。本阶段把 Codex 接入同一条生产链，只连接
本机 loopback **Responses** 假端点：

```text
Server → Core → generic sidecar deployment → c5 release Worker(ABW1 interactive) → bwrap
       → /runtime/artifacts/codex-runtime/node_modules/@agentclientprotocol/codex-acp/dist/index.js
       → Codex app-server (0.147.0, 工件内原生二进制) → local loopback /responses endpoint
```

终态：**CODEX_PRODUCTION_CHAIN_PREPARED**；Codex 仍为 **MODEL_NOT_VERIFIED**（本阶段未读凭据、未访问真实
模型或任何非 loopback 目的地的模型请求；唯一外网动作是只读抓取官方安装脚本）。
`BACKEND_IMPLEMENTATION_READY` 未登记，`workbench_model_verified_count` 仍为 0。

## 1. 官方配置与目录（只读提取，未执行脚本）

| 项 | 值 |
| --- | --- |
| 官方脚本 | `https://cdn.deepseek.com/api-docs/codex-deepseek-setup.sh`，`SCRIPT_VERSION=1.3.0` |
| 脚本字节 / SHA-256 | 108031 / `0a3a33704e1fb1579300d559f009279c7db8e06aa428a0cba07ac9e265a130ca` |
| 签入证据 | `deploy/codex/codex-deepseek-setup.sh`（同摘要、只读、从不执行）+ `deploy/codex/official-script.json`（URL/版本/摘要/字节/heredoc 元数据/`"executed": false`） |
| models.json | 76107 字节，SHA-256 `bce20f679495809f4fa6e48672b6dcbab84b6adff5251890b6e6a21eddb9c12f`（`write_models_json` heredoc 原始字节，完整目录不截取） |
| 与既有资产 | 与 `codex/deepseek-models.json` **逐字节相同**（登记等值并复用，不建第二份目录） |

生产配置 `deploy/codex/config.toml`（逐字段测试）：`model="deepseek-flash"`、
`model_provider="deepseek"`、`preferred_auth_method="apikey"`、`forced_login_method="api"`、
`model_reasoning_effort="high"`、`web_search="disabled"`、
`model_catalog_json="/runtime/home/.codex/models.json"`、`cli_auth_credentials_store="ephemeral"`、
`[model_providers.deepseek]`（`name="deepseek"`、`base_url="https://api.deepseek.com/"`、
`wire_api="responses"`、`env_key="CODEX_API_KEY"`）。不含 loopback 地址、不含 token、不含 `/v1`。

`cli_auth_credentials_store = "ephemeral"` 的受支持性经**只读探测**确认（用工件内 0.147.0 二进制，
`CODEX_HOME` 指向临时目录）：非法值报
`unknown variant 'definitely-not-a-value', expected one of 'file', 'keyring', 'auto', 'ephemeral'`，
`ephemeral` 被接受；且 Codex 运行后的 checkpoint 里**没有 `auth.json`**（认证未落盘）。

两处与最初设想的差异，均为实测必需：`env_key` 与注入名必须是 **`CODEX_API_KEY`**（`codex-acp 1.1.14`
的 ACP api-key 认证只读 `CODEX_API_KEY`/`OPENAI_API_KEY`，且原生 provider 只认 `env_key`；这与 42-D 早已
登记的 `CODEX_API_KEY` 首选认证接缝一致）；`cli_auth_credentials_store="ephemeral"` 用于避免把凭据落盘
成明文 `$CODEX_HOME/auth.json`（落盘会被 sidecar 以 `SIDECAR_STATE_CONTAINS_SECRET` 正确拒绝捕获）。

## 2. Codex 运行时工件（最小闭包、摘要固定、只读、双构建一致）

| 项 | 值 |
| --- | --- |
| 构建器 | `scripts/server-round1/build-codex-runtime-artifact.mjs`（只读已安装且被 lock 固定的包，不 npm install） |
| 包数 / 条目 / 字节 | 20 / 529 / 320 807 886 |
| tree digest | `sha256:9051b844a8feeb241667dd0cc03e80d082e140e88e49ecb3f195385e209f2ca1`（双构建一致） |
| ACP 适配器 | `@agentclientprotocol/codex-acp` **1.1.14**（入口 `dist/index.js`）+ `@agentclientprotocol/sdk` 1.3.0 |
| Codex CLI/app-server | `@openai/codex` **0.147.0** / 平台包 `0.147.0-linux-x64`（`x86_64-unknown-linux-musl`，`bin/codex` + `codex-code-mode-host` + `codex-path` + `codex-resources`） |
| 只读发布 | 目录 0555、可执行 0555；owner marker + manifest（树外）；未标记非空输出拒绝且不删除 |

## 3. 生产模板与能力

`codex/production.py` 输出通用字段：`runtimeArtifactMounts`（→ `/runtime/artifacts/codex-runtime` + treeDigest）、
`projectionFiles`（`config.toml`、`models.json` → `/runtime/home/.codex/…` RO）、
`stateProjection.target=/runtime/home/.codex`、`adapter{/usr/bin/node, 工件内入口, env `CODEX_HOME=/runtime/home/.codex`}`、
`credentialKind="api-key"`、`credentialEnvironment="CODEX_API_KEY"`、`preferredAuthMethod="api-key"`、
`modelControlId="model"`（实测 `session/new` 播发 `configOptions.model`，值即 `deepseek-flash`）、
`model_aliases()={}`（Codex 无 `provider/model` 拼写）。Server/Core/Worker/bwrap 无 Codex/DeepSeek 分支。

`HAS_PRODUCTION_DEPLOYMENT` 在**默认门真实通过后**才翻为 `True`；`observed_capabilities()` 仅含门里真正
发生的能力：`start`、`observe`、`finish`、`stream`、`native_continuation`。`attach`、`permissions` 未在
链路上发生过，保持未观测（即使静态候选声明了它们）；`steer` 未声明。

## 4. 全链门结果

命令：`python3 scripts/server-round1/codex-production-chain-gate.py --worker <c5 bundle> [--artifact <built>] --json`

- **默认运行：exit 0，`CODEX_PRODUCTION_CHAIN_GATE_OK`**；
  **外部工件运行：exit 0**，`artifact.external=true`、`preservedAfterCleanup=true`、摘要不变、
  `run.removed=true`、无残留。
- 两轮：首轮 `completed`，delta seq **4 < completed 7**（用时 9.4s，其中假端点被受控静默 8s，默认 5s 租约
  未改）；次轮 delta `10, 12 < completed 15`，**请求体含第一轮 user 与 assistant**。
- provider：路径全部 **`/responses`**（不是 `/chat/completions`），`model="deepseek-flash"`、
  `reasoning.effort=high`、`stream=true`；`Authorization` 与注入假 token 精确匹配、未授权请求 0。
- **原生重开**：方法序列 `initialize → authenticate → session/list → session/load → session/prompt`，
  即 ACP **`session/load`（带重放）**，同一 `nativeSessionId`（`nativeSessionIdStable=true`）——
  **不是** `session/resume`。
- **隔离 HOME**：适配器与两个 app-server 子进程（node 启动器 + 原生二进制）都继承
  `CODEX_HOME=/runtime/home/.codex`，且 `$HOME/.codex` 与 `CODEX_HOME` realpath 相等；guest 内实读
  `config.toml`(1706B) 与**完整** `models.json`(76107B)；受控临时 host-home 的三处 sentinel 均不可见，
  Profile sentinel 在投影配置中可见；`config.toml`/`models.json` 写入 `EROFS`，state 写入成功并被捕获
  （100 文件，`resumable=true`，其中 `config.toml`/`models.json` 作为受保护路径**不进 checkpoint**）。
- **凭据**：只经 SecretStore → Worker `secret.put` → 环境注入；`tokenInDeployment/Events/State/Workspace`
  全 false、未授权请求 0、生产配置内无凭据；未开启适配器日志（实测其会记录含 apiKey 的
  `account/login/start`），进程级证据改由只记录环境键值/方法名的 guest 审计 shim 提供。
- 反例：未知模型 `deepseek-unknown` 在**发 HTTP 前**拒绝（新增请求 0）；取消 `turn=cancelled`
  （0.07s，cleanup `cleaned`）；state 里的 argv0 别名符号链接被如实记录并跳过。

## 5. 本阶段发现的两个通用缺陷（已修）

1. **Worker view 列表遇符号链接即整份失败**：Codex 运行期必写 argv0 别名链接，导致 state 捕获必然
   `VIEW_INVALID`。修复（后续返修轮进一步收紧为最终合同）：`list_view_files` **跳过符号链接**（不跟随、
   不读取、不捕获，且不删除，cleanup 仍可用），`view.get` 仍拒绝非普通文件；**FIFO/socket/设备类型化
   拒绝整个 listing**（不再静默跳过）；**所有访问条目计入统一 traversal 上限 4096**；state 捕获改为
   **内容稳定性门**（完整 snapshot path+size+digest 连续两次相同才接受，deadline 到期抛
   `SIDECAR_STATE_NOT_SETTLED`，绝不静默生成 checkpoint）。
2. **gate 在"外部工件缺失"时会挂起而非失败**：`finally` 里 `endpoint.stop()` 对**从未 start** 的
   `serve_forever` 调 `shutdown()` 会永久阻塞（实测 40 分钟）。修复：四个 gate 的端点 stop 幂等且只有
   真正 start 过才 shutdown；Codex gate 对缺失的外部工件给类型化 `CODEX_GATE_ARTIFACT_MISSING` 立即失败，
   **不静默重建**（否则"外部工件"证据就没有意义）。

## 6. 验证计数

```text
python 全量（tests + 全部插件 tests）        → 786 passed / 4 skipped / 0 failed
四家 gate（Pi/Hermes/OpenCode/Codex，串行）  → 全部 exit 0；Codex 外部工件模式另 exit 0
runtime-artifact gate（c5）                 → exit 0
node：harness_remote 25/25、能力声明 13/13、42d 4/4、构建器 11/20/9/9
Rust：cargo fmt --check 干净；cargo test --locked --release 11 passed
Windows c5 r4 + PostCheck                   → exit 0 / …_POSTCHECK_CLEAN
```

## 7. 范围与未完成项

- Codex 仍 **MODEL_NOT_VERIFIED**：本门用 loopback 假端点与固定 nonce，不是模型能力证据；四家真实模型门
  均未执行。
- **bundle 演进 c4 → c5 → c6**（Worker 的 view 列表修复与合同收紧）：c4 与 c5 均未被覆盖、仍是历史有效
  证据；该报告撰写时的最新 Windows r4 用 **c6**（其后已先后用 c7/c8 复跑，见 state-error-boundary.md）
  （`sha256:96256b2ea76218448183fc0b1063aba92c15fca3fb22fa8a00f7e0f7efc2466e`）。版本口径：
  **ABW1 frame 与 manifest `wireVersion = 1`**，而 **Worker control `PROTOCOL_VERSION = 3`**——
  本轮没有改变任何响应形状，因此 control protocol 不升版。
- 已知残余：`cli_auth_credentials_store="ephemeral"` 属官方支持的配置键，但"凭据完全不落盘"仍取决于该
  版本实现；**2026-09-15 更新：无模型门已观测到假 token 进入原生 state 的反例（fail-closed 拦截），必须先用假 token 定位并消除该泄漏路径、且经付费 preflight Reviewer ACCEPT 后，才允许读取真实 locator 或运行真实模型门**；工件摘要在 bootstrap 校验一次（既有 TOCTOU 窗口）；
  bwrap 网络姿态未改。
