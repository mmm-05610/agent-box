# 42-D Pi 生产封装与本地假端点全链验证

日期：2026-09-14。分支 `feature/server-harness-extension-v1`。本阶段用**真实 Pi ACP adapter 与真实
Pi coding agent 依赖闭包**，只连接本机假 DeepSeek 兼容端点，打通：

```text
Server → Core → generic sidecar deployment → c4 Worker ABW1 interactive → bwrap
       → real @automatalabs/pi-acp@0.5.0 → real Pi 依赖闭包 → local fake DeepSeek endpoint
```

终态：**PI_PRODUCTION_CHAIN_PREPARED**。Pi 仍为 **MODEL_NOT_VERIFIED**（本阶段不是付费模型验收，
未读凭据、未访问真实模型或任何非 loopback 地址）。`BACKEND_IMPLEMENTATION_READY` 未登记。

## 1. Pi 运行时工件闭包

构建入口：`scripts/server-round1/build-pi-runtime-artifact.mjs`（只消费现有
`plugins/agent-box-harnesses/runtime/package-lock.json` 与已存在的 `runtime/node_modules`，
**不运行 npm install / npm ci、不联网**）。

| 项 | 值 |
| --- | --- |
| 输出布局 | `<output>/node_modules/…` + owner marker `.agentbox-pi-runtime-artifact` |
| adapter 入口 | `<output>/node_modules/@automatalabs/pi-acp/dist/index.js`（guest 内 `/runtime/artifacts/pi-runtime/…`） |
| 包数 | **317** |
| 条目数 | **15458**（上限 32768） |
| 字节数 | **64 909 674**（约 64.9 MiB；上限 1 GiB） |
| tree digest | `sha256:afe238d3439df45af77581f7bc969897aa445a1c7b9a686c36c9a31dafa8420f` |
| 源锁摘要 | `sha256:75e25605bd3b57da85fd098dc160f7bb7f5cea2fccf52755d8b85b3434c1240` |
| manifest | `<output>.manifest.json`（在工件树**之外**，故不改变 digest；不入 Git，输出目录在工作区外） |
| 只读化 | 目录 0555、文件 0444 |
| 双构建一致 | 同一输入连续两次构建 digest／条目／字节／manifest 完全相同 |

闭包规则（按 Node 自身解析顺序，从 `@automatalabs/pi-acp` 起）：

- `dependencies` 全部必需，缺失即 `PI_CLOSURE_DEPENDENCY_MISSING`；
- `optionalDependencies` 仅在**实际安装且 `os`/`cpu` 匹配本平台**时纳入，否则记录为 skipped（实测：
  `@mariozechner/clipboard` 的 linux-x64 gnu/musl 纳入，win32/darwin 变体 skipped）;
- `peerDependencies` 中被 `peerDependenciesMeta` 显式标 optional 的可缺席，其余缺失即
  `PI_CLOSURE_PEER_MISSING`。

版本固定与校验：

- `@automatalabs/pi-acp` = **0.5.0**（不等即 `PI_ADAPTER_VERSION_MISMATCH`）；
- `@earendil-works/pi-coding-agent` = **0.84.2**、`@earendil-works/pi-ai` = **0.84.2**（存在即校验）；
- **每一个**被选中的包，其 `package.json` 版本必须与 `package-lock.json` 中该**精确路径**记录的版本
  一致（不符即 `PI_LOCK_VERSION_MISMATCH`，无 lock 条目即 `PI_LOCK_ENTRY_MISSING`）；
- 实际安装的 ACP SDK：`node_modules/@automatalabs/pi-acp/node_modules/@agentclientprotocol/sdk`
  = **1.3.0**，与 package-lock 记录一致（根 `overrides` 把 `@agentclientprotocol/sdk` 钉在 1.3.0，
  adapter 自身声明的 1.4.0 被该 override 取代）。该版本被单独断言。
- 闭包内出现的 `@earendil-works/pi-telemetry` 依 lock 解析为 **0.84.4**（上层范围 `^0.84.2`），
  本阶段据实记录，不谎称 0.84.2。

只复制运行时文件：`.bin/`（npm 生成的符号链接农场）、`.package-lock.json`、`*.d.ts`、
`*.d.ts.map`、`*.js.map` 等源码映射、`*.ts/tsx` 源码、`*.md` 文档一律不进入工件；`.node`/`.wasm`
等原生件保留（实测 photon-node 的 wasm 与 clipboard 的 .node 均在）。原始 47 398 条目的全量
`node_modules` 因此收敛到 15 458 条目，仍高于工作令要求的 32 768 上限之下。

反例（构建器单元测试 11 项，全部通过）：缺失依赖、lock 版本不符、lock 无条目、adapter 版本非
0.5.0、闭包内 symlink、闭包内 FIFO、把仅在 codex 闭包内的包（`@openai/codex`）带进来、
超 1 GiB、输出在仓库内/相对路径/用户配置目录、未标记的非空输出（**拒绝且不删除**）、
已属本构建的输出需 `--replace`。工件形态断言另保证：无 symlink、无 socket/FIFO/device、
无 `.bin` 目录；并且本构建只递归删除带本阶段 owner marker 的路径（未标记路径仅空目录用 `rmdir`
处理，永不递归删除）。

## 2. 生产配置与测试覆盖的界限

生产模板由插件拥有：`plugins/agent-box-harnesses/src/agent_box_harnesses/pi/production.py`
+ 同目录下 `deploy/pi/{models.json,settings.json}`。**不复制第二套漂移实现**：一个测试运行
`model-validation-42d.mjs --family pi --dry-run`（用测试自建的 0600 假 token 文件）并断言该
`config`/`settings` 与插件模板**逐字段相等**。

锁定值：

| 项 | 生产值 |
| --- | --- |
| 产品/ProviderModel modelId | `deepseek-flash`（不变） |
| provider | `deepseek`；`api: openai-completions` |
| base URL | `https://api.deepseek.com`（**官方根地址**） |
| API key | 环境引用 `$DEEPSEEK_API_KEY`（文件内无任何秘密） |
| 输出上限 | `maxTokens: 64`（每轮 ≤64） |
| thinking | 禁用（`samplingParams.thinking.type=disabled`，`reasoning:false`） |
| 重试 | agent 与 provider 双关闭（`retry.enabled=false`、`maxRetries=0`、`provider.maxRetries=0`） |
| Pi 原生选择值 | `deepseek/deepseek-flash` |
| `PI_CODING_AGENT_DIR` | `/tmp/agentbox-home` |
| models/settings | 只读 `projectionFiles` 进入隔离 HOME |
| native sessions | `stateProjection.target=/tmp/agentbox-home/sessions`（= Pi 的 `getSessionsDir()`） |
| credential | `kind=api-key`、环境变量由 Pi 部署声明（`DEEPSEEK_API_KEY`） |
| adapter 入口 | `/runtime/artifacts/pi-runtime/node_modules/@automatalabs/pi-acp/dist/index.js`（来自摘要固定的工件） |
| 模型控制 | `modelControlId="model"`，`controlOptions` **不给默认值**（模型是 Provider/Model 引用，静默默认会让用户没选的模型跑起来） |

**测试临时覆盖只有四项，且全部在运行期施加、不落盘为生产配置**：

1. `models.json` 的 `baseUrl` 指向 loopback 端点（`documented_differences` 断言**只改这一个字段**）；
2. adapter 环境追加 `NODE_OPTIONS=--require /tmp/agentbox-home/pi-loopback-guard.cjs`；
3. adapter 环境追加 `AGENTBOX_EGRESS_AUDIT=/workspace/.agentbox-egress-audit`；
4. `projectionFiles` 追加只读的 `deploy/pi/loopback-guard.cjs`。

门在每次运行时断言生产模板仍是官方根地址、且生产默认里**没有** `NODE_OPTIONS`/审计路径/守护文件。

**模型选择转换**由 Harness 扩展层负责，Server/Core 无品牌分支：
`runtime/profile_extensions.mjs` 的 `AGENTBOX_MODEL_ALIASES = { pi: { "deepseek-flash":
"deepseek/deepseek-flash" } }` + `runtime/worker-entry.mjs` 在 `create`/`prompt` 两个携带模型的
envelope 操作上通用地套用（无 Harness 名分支——测试断言 sidecar 入口里不出现
`pi-acp`/`automatalabs`/`deepseek` 字样）。该表与插件模板的一致性由测试跨语言比对（Node 侧导出
与 Python 侧 `model_aliases()` 相等）。

## 3. 真实 Pi + 本地假端点全链结果

命令与退出码：

```text
PYTHONPATH=<src + 全部 plugins/*/src> \
python3 scripts/server-round1/pi-production-chain-gate.py \
        --artifact <built pi-runtime> [--json]
→ 退出码 0；result = PI_PRODUCTION_CHAIN_GATE_OK
```

链路：唯一 release c4 Worker（`sha256:31e92959…`，与本阶段记录一致）+ bwrap +
`/runtime/artifacts/pi-runtime` 只读投影 + 真实 `@automatalabs/pi-acp@0.5.0` + 真实 Pi 依赖闭包 +
本机 127.0.0.1 假端点。凭据为**临时 0600 假 token**，经既有 Server SecretStore →
`CredentialRecords` → ProviderModel.credentialId → 冻结执行配置 → `secret.put` 帧 →
Worker 物化 `/runtime/secret/credential` → sidecar 注入 `DEEPSEEK_API_KEY` 到 adapter 进程。

脱敏结果（gate JSON 摘录）：

```json
{"rounds": {"first":  {"state": "completed", "deltaSeq": [4],  "deltaText": ["PI-GATE-NONCE-1F4A9C"], "completedSeq": 7,  "deltasBeforeCompletion": true},
            "second": {"state": "completed", "deltaSeq": [11], "deltaText": ["PI-GATE-NONCE-2B7D31"], "completedSeq": 14, "deltasBeforeCompletion": true}},
 "provider": {"paths": ["/chat/completions", "/chat/completions"],
              "unauthorizedRequests": 0, "requestsBeyondBudget": 0},
 "checkpointAfterFirst": {"schemaVersion": 2, "resumable": true, "harnessType": "pi",
                          "nativeSessionId": "01a09edc-…-e40b573440ad",
                          "files": ["--workspace--/2026-09-14T07-40-21-561Z_01a09edc-…-e40b573440ad.jsonl"]},
 "nativeSessionIdStable": true,
 "deltaAttribution": {"deltas": 2, "unattributed": 0},
 "unknownModel": {"state": "failed", "providerRequestsAfterRefusal": 0, "refusedBeforeProviderRequest": true,
                  "reasonMentionsModel": true,
                  "reasons": ["SidecarError: SIDECAR_OP_FAILED: Harness model is not available: deepseek-unknown"]},
 "egress": {"guardLoaded": true, "denied": [], "auditPresent": true},
 "cleanup": {"workerProjectionsRemoved": true, "adapterProcessesRemoved": true,
             "fakeTokenRemoved": true, "workspaceRemoved": true}}
```

逐项：

- **provider 请求：两轮合计恰好 2 次**（假端点计数；`requestsBeyondBudget=0` 表示没有任何超出预算的
  请求，隐式重试会立即失败）。路径 `/chat/completions`。
- **请求体（脱敏结构）**：两轮均为 `model="deepseek-flash"`（精确值，而非原生
  `deepseek/deepseek-flash`）、`max_tokens=64`（≤64 上限）、`thinking={"type":"disabled"}`、
  `stream=true`、`tools=4`。
- **Authorization**：两次都是 `Bearer <注入的假 token>`（端点只记录"是否与注入值相符"，从不记录
  值本身），`unauthorizedRequests=0` → 秘密确实经 Server→Worker→sidecar 送达 adapter 进程。
- **第二轮上下文**：请求 2 的 messages = system(2615 字符) + **第一轮 user（含 NONCE-1）** +
  **第一轮 assistant（20 字符，含 NONCE-1）** + 新的 user → 续接上下文存在（上下文来自 Pi 自己的
  journal，而非 Server 重放）。
- **delta 顺序**：第一轮 delta 序号 4 < completed 7；第二轮 delta 11 < completed 14（同一持久事件流）。
- **native 恢复**：第二轮 checkpoint 的 `nativeSessionId` 与第一轮相同；`stateProjection` 子树
  `/tmp/agentbox-home/sessions` 被回读，checkpoint `schema_version=2`、`resumable=true`、
  `harnessType="pi"`、单文件 `--workspace--/<时间戳>_<sessionId>.jsonl`（Pi 的 journal）。
- **重开方法（按 Pi 的权威 journal 语义验证，不是猜）**：门额外用同一 launcher／工件／bwrap／Worker
  直接观察重开过程（Server 看不到这一步，它在 Worker 内发生）：

  ```json
  {"nativeSessionIdStable": true,
   "chunksDuringReopen": [{"kind": "message.delta", "text": "PI-GATE-NONCE-1F4A9C"}, {"kind": "started"}],
   "chunksAfterReopenPrompt": [{"kind": "message.delta", "text": "PI-GATE-NONCE-1F4A9C"}, {"kind": "started"},
                               {"kind": "message.delta", "text": "PI-GATE-NONCE-2B7D31"}],
   "replayedStoredTurn": true, "stateResumable": true, "providerRequests": 2}
  ```

  重开时 adapter **重放了已存储的那一轮**（第一轮答案 chunk 在 `started` 之前到达）。Pi 的
  `session/load` = `reattach(replay=true)`、`session/resume` = `reattach(replay=false)`；出现重放即
  证明走的是 **`session/load`**，与本阶段预期一致，**不得**写成 `session/resume`。adapter 的
  model catalogue 同时把 `resume` 作为可选能力播发（原生 `deepseek/deepseek-flash` 出现在目录项中），
  但 bridge 对声明权威 journal 的 Pi 选择重放路径。
- **未知模型在发 HTTP 之前拒绝**：产品模型 `deepseek-unknown` 的会话以
  `Harness model is not available: deepseek-unknown` 失败，且假端点计数**仍为 2**（零新增请求）。
- **重放 chunk 的归属**：`deltaAttribution` 显示持久 delta 恰好每轮 1 条、无归属不明的 delta。
  重开期间的重放 chunk 在 Server 侧未被登记到任何 turn（该 chunk 到达时新 execution 尚未绑定），
  因此不会把上一轮答案重复写进新轮转写。这是本阶段观察到的既有行为，未改动。
- **egress**：只读守卫生效（`guard-loaded`），**零** `denied` 记录 → 该门从未尝试非 loopback 目的地；
  一旦尝试，`net.Socket.prototype.connect`/`tls.connect`/`dns.lookup` 会在解析与连接前抛
  `AGENTBOX_EGRESS_BLOCKED` 并让该轮失败。
- **凭据扫描**：捕获的 native state（checkpoint 内每个文件）与持久事件中**均无**假 token；
  gate 报告本身也不含 token 值。
- **清理**：Worker `views/`、`secrets/` 无残留；无存活 Pi adapter 进程；临时假 token、workspace、
  DataRoot、假端点与临时工件目录全部移除（`run.removed=true`）。清理失败不会覆盖主失败：清理检查
  在报告已记录主结果之后执行，且以独立 code 失败。

## 4. 本阶段发现并修复的真实公共缺陷

**ACP 能力标记被当成布尔值，导致所有按 ACP 约定播发能力的 Harness 被判为"不可续接"。**

- 现象：真实 Pi 的 `start` 播发 `sessionCapabilities: {"resume": {}, "fork": {}, "list": {}, "close": {}}`
  ——ACP 用*空对象*表示"具备该能力"。Server 侧
  `bool((started.get("sessionCapabilities") or {}).get("resume"))` 在 Python 里对 `{}` 求值为
  **False**，于是第一轮 checkpoint 落成 `resumable: false`。
- 后果：第二轮启动时 `_restore_sidecar_state` 以 `resumable is not True` 判为
  `SIDECAR_CHECKPOINT_INVALID`（它被设计为"不可用 checkpoint 必须失败，不得新造 session"），
  第二轮直接失败 —— 即 Pi 在生产链上**根本无法续接**。
- 修复（中立、无品牌分支）：`src/agent_box/server/execution/sidecar.py` 新增
  `_advertised(capability)` = "存在且不为 False 即视为已播发"，仅替换该处真值判断。
- 回归测试：`tests/server/test_harness_sidecar.py::test_sidecar_reports_resume_only_when_the_harness_advertised_it`
  参数化 7 例（`{"resume": {}}`→True、`True`→True、`{"resume": {"cwd": true}}`→True、`False`→False、
  `None`→False、`{}`→False、`{"fork": {}}`→False），强度不降。
- 端到端验证：修复后本门第二轮以同一 native id 完成，checkpoint `resumable=true`，重放证据如上。
- 说明：40/41 阶段的组件门用的是把能力写成布尔 `true` 的 fake peer，因此从未暴露该差异；本阶段用
  真实 adapter 才复现。

## 5. 生产封装边界（Server 无品牌判断）

- Server/Core/Worker/bwrap 只见通用字段：`runtimeArtifactMounts`、`projectionFiles`、
  `stateProjection`、`adapter`、`credentialKind`/`credentialEnvironment`、`modelControlId`。
- 唯一的 Server 侧改动是上一节的中立能力判断，以及给
  `build_runtime_from_sidecar_deployment` 增加可选 `secret_store` 注入（与 `build_runtime` 同形，
  使声明了凭据种类的部署可以由调用方提供存储）。
- 未修改 Worker 协议、Core、Desktop wire 或 Windows 脚本。

## 6. 验证命令与结果

```text
node --test scripts/server-round1/build-pi-runtime-artifact.test.mjs     → 11 passed, 0 failed
node --test scripts/server-round1/model-validation-42d.test.mjs          → 4 passed, 0 failed
node --test plugins/agent-box-harnesses/tests/harness_remote/*.test.mjs  → 25 passed, 0 failed
python3 -m pytest -q tests plugins/agent-box-harnesses/tests \
  plugins/agent-box-runtime-wsl/tests plugins/agent-box-sandbox-bwrap/tests \
  plugins/agent-box-runtime-local/tests                                  → 444 passed, 4 skipped, 0 failed
    （上一阶段同一命令基线 424 passed / 4 skipped；本阶段 +20 项：模板 12 + 能力回归 7 + 凭据拒绝 1）
python3 -m pytest -q tests/server/test_harness_sidecar.py                → 91 passed
python3 scripts/server-round1/runtime-artifact-gate.py \
  --worker .acceptance-bundle-c4/agent-box-worker                        → 退出码 0；RUNTIME_ARTIFACT_PROJECTION_GATE_OK（底座未退化）
python3 scripts/server-round1/pi-production-chain-gate.py \
  --artifact <built pi-runtime>                                          → 退出码 0；PI_PRODUCTION_CHAIN_GATE_OK
git diff --check                                                         → 干净
python3 -m py_compile / node --check <全部改动文件>                       → 通过
```

双构建 digest 一致：同节 §1（构建器测试内断言两次构建的 digest/条目/字节/manifest 完全相同）。

## 7. 范围与未完成项

- **本阶段只登记 PI_PRODUCTION_CHAIN_PREPARED**；Pi 仍为 **MODEL_NOT_VERIFIED**，
  `workbench_model_verified_count = 0`。门用的是本地假端点与两个固定 nonce，不是模型能力证据。
- **模型调用 0、费用增量 ¥0**；累计仍为 **1 次 / 12 tokens / <¥0.01**（上限 ¥10）。未读任何真实凭据
  （假 token 由门自行生成并用后删除）。
- **c4 仍无 Windows 平台证据**：本阶段按要求未运行 Windows r4、未占用 Windows 构建槽，直接驱动 WSL
  内的 release Worker（同一 ABW1 协议），Windows c4 复验留待后续。
- 未做（后续阶段）：Hermes（隔离 Python 包闭包）与 OpenCode（单文件二进制沿用
  `executableMounts`，不退化）的同级封装；三家真实模型门。
- 已知残余：重放 chunk 在 Server 侧不被登记（现有行为，见 §3）；工件摘要在 bootstrap 校验一次
  （既有 TOCTOU 窗口，与本阶段无关）；bwrap 网络姿态未改，本阶段靠只读守卫保证"仅 loopback"。
