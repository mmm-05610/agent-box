# Work Order 40-D — 四家接入汇总矩阵

日期：2026-09-14。终态：**`FOUR_HARNESS_COMPONENTS_READY`**（四家组件门全过，
仍**没有**任何真实模型验收）。零模型调用、零凭据读取，本轮费用 ¥0。

## 逐家矩阵

| 项 | Codex | Pi | Hermes | OpenCode |
| --- | --- | --- | --- | --- |
| 状态 | COMPONENT_VERIFIED / MODEL_NOT_VERIFIED | COMPONENT_VERIFIED / MODEL_NOT_VERIFIED | COMPONENT_VERIFIED / MODEL_NOT_VERIFIED | COMPONENT_VERIFIED / MODEL_NOT_VERIFIED |
| 底座 | 快照 ACP（上游 profile `codex`） | 快照 ACP（上游 profile `pi`） | 快照 ACP + AgentBox 窄注册（上游**无** hermes profile） | 快照托管 HTTP host（`ManagedOpenCodeHost`），**非** ACP profile |
| 适配器工件 | `@agentclientprotocol/codex-acp@1.1.14`（Apache-2.0） | `@automatalabs/pi-acp@0.5.0`（Apache-2.0） | 本机 `hermes-agent 0.19.0`（MIT）自带 `hermes acp` | 本机 `opencode-ai 1.18.21`（MIT）`opencode serve` |
| 下层原生件 | `@openai/codex@0.147.0`（随适配器锁入，Apache-2.0）+ ACP SDK 1.3.0 | `@earendil-works/pi-coding-agent@0.84.2` 族 + ACP SDK 1.3.0 | Hermes 自身运行时（Python 3.12） | OpenCode 自身运行时（bun 编译二进制） |
| 复用文件 | 快照 20 文件 + `acp-client.js` 权限补丁 1 处 | 同左（同一闭包） | 同左 + `runtime/profile_extensions.mjs` 注册数据 | 快照 `opencode-host.js`/`managed-event-fanout.js`/`agent-router.js`/`http-policy.js`/`task-model.js` |
| 真实二进制零凭据握手 | **TYPED_FAILURE**：`CODEX_API_KEY or OPENAI_API_KEY is not set`（448 ms） | **INITIALIZED**（906 ms）agentInfo `pi coding agent 0.5.0` | **INITIALIZED**（1939 ms）`hermes-agent 0.19.0` | **HEALTH_OK**（2102 ms） |
| 原生协议路径 | `codex app-server`（工件内 5 处 spawn 位点；`exec`/`--json`/`jsonl` 0 处）✅ 不退化为 exec JSONL | ACP over stdio | ACP over stdio | HTTP + SSE |
| 能力声明（实测/声明） | todos=true, models=true, commands=true, sessionRename/Delete=true, actions=false | todos=**false**, models=true, commands=true, actions=false | 全部 false，除 sessions/prompt/abort/streaming/filesystemBrowser | actions=true, todos=true, permissions=false |
| 专有/差异能力 | reasoning_effort 变体；rollout journal 可读 | thinkingLevel 变体别名；journal 权威 transcript | fork/list/resume（无 fork 之外的上游对齐物） | 原生 rename/delete/stop/model 变更子集 |
| 缺失能力 | actions；审批需 AgentBox 解析器（上游仅静态 allow） | actions；thinking 变体依赖适配器版本 | models/todos/commands/actions/rename/delete 全部未声明；无已审 history loader → transcript 仅实时流 | permissions 未声明；会话/续接语义按 HTTP 原语 |
| 已执行测试 | 快照接缝、侧车 envelope、四家组件门逐项（initialize/streaming/cancel/断连/审批/身份） | 同左 | 同左 | 快照接缝（健康+Windows 进程边界）、四家组件门注册段、真实二进制健康握手 |
| 平台未执行 | Windows 侧真机 WSL 全链路（41/42）；真实模型闭环（42-D） | 同左 | 同左；另有 Windows 上 `hermes`/`PYTHONPATH` 路径未验证 | 同左；Windows 上 `opencode.exe` 启动分支未验证 |

四家共同的 MODEL_NOT_VERIFIED 原因：无真实模型调用被授权执行（40 单禁止），且
Codex 适配器在握手阶段即要求 API key。真实门见 42 §D。

## 依赖与许可闭合

- 快照：harness-remote v3.0.2 @ `21ce6db…`，Apache-2.0，逐文件哈希见 `SOURCE.json`，
  修改通告见 `PATCHES.md`（仅 `acp-client.js` 权限补丁 + 新增注册工厂文件）。
- 离线锁：`runtime/package-lock.json` 349 包全部带 sha512；`artifacts/SBOM.json` 逐包
  记录 name/version/integrity/resolved/license；两个顶层适配器 tarball 入库 `vendor/`。
- 平台二进制**不**入 git；安装后必须校验（见下）。
- Hermes/OpenCode 使用用户本机安装，本单**未**改动、未升级、未替换其安装；
  生产打包时的再分发条款需在下一次外部分发前单独审计（Hermes MIT / OpenCode MIT
  对再分发友好，但仍需按实际打包方式复核）。

## 实际执行的测试（40 全单）

```text
python3 -m pytest -q tests plugins/agent-box-runtime-wsl/tests plugins/agent-box-harnesses/tests
→ 227 passed, 4 skipped, 0 failed     （PYTHONPATH=src + 全部 plugins/*/src）

node --test plugins/agent-box-harnesses/tests/harness_remote/*.test.mjs
→ tests 25, pass 25, fail 0           （快照接缝12 + 侧车4 + 四家组件9）

cargo test --release (workers/agent-box-worker)
→ 4 passed, 0 failed                  （含新增的旧版 bootstrap → protocolVersion 0 证据）

node scripts/server-round1/harness-handshake-40c.mjs --json
→ codex TYPED_FAILURE / pi INITIALIZED / hermes INITIALIZED / opencode HEALTH_OK
```

平台未执行项（如实列出，不用 fake 冒充）：Windows 真机 `test_stage_c_windows_wsl_offline.py`
需 `AGENT_BOX_TEST_WSL_*`；4 项 POSIX/Windows 条件 skip 保持原样；全部真实模型门。

## 本单发现并修复的自身缺陷

1. **内嵌 codex 二进制截断**（40-A 遗留）：一次 `npm ci` 留下 16 MiB 截断二进制导致段错误。
   锁与 integrity 经复验正确；根因是缺少**安装后产物校验**。已列为必需步骤，并以
   握手脚本 `artifacts` 段记录字节数与版本作为落点。
2. **Rust 测试初始化遗漏**（40-B 遗留）：`cargo build` 通过但 `cargo test` 抓到
   `Bootstrap.protocol_version` 未在测试 fixture 中初始化。已修，并补一条
   "旧客户端 bootstrap 解码为 0 → worker 大声拒绝"的证据测试。
3. **37 测试竞态**：`test_capture_failure...` 在终止状态持久化后立即断言其后的
   `abandon` 副作用；探针证实间隔约 50 ms，负载高时 10/10 失败。已改为有界等待，
   断言强度不变（修后 10/10 通过）。

## 交接 41 的边界

- Server 侧接入尚未发生：本单交付的是**扩展实现与其组件证据**，不是 Server 已能
  编排四家。Worker(Python)→sidecar 封装、Harness 能力注册到 `HarnessRegistry`、
  以及 41 的 wire 锁定与核心用例实现，均在 41。
- `runtime/profile_extensions.mjs` 是唯一新增的注册胶水；40-C 的组件门已证明它不引入
  品牌分支。
