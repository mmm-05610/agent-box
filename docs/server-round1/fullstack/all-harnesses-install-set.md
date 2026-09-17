# 全部 Harness 装一台 Server —— 工单 46 执行证据

2026-09-17。执行者：环境 provider 会话（`feature/env-provider-v1`）。
真实模型调用（本单执行部分）：**0** 次、费用 **¥0**（Stage C 真实 UI 门因外部资源缺席未跑，
见 §4 阻塞账；授权仍在，未消费）。

## 0. 结论

**ALL_HARNESSES_FULLSTACK_PARTIAL**（阶段A完成：8 家安装集产出器 + 幂等验证；
阶段B完成：一份文档 8 家并存 Server 的第一手证据；阶段C/D/E 的 UI 门、
隔离反例、收口被外部资源与产品裁决阻断，见 §4/§5）。

## 1. 合并（§1b，用户 2026-09-16 授权的那一次）

- 扩展工作树 `agent-box-harness-expansion`（`feature/harness-expansion-v1`，HEAD `c1a7ea9`）
  `status --porcelain` **0 行**，无并发写者。
- `git merge feature/harness-expansion-v1` → **3 个冲突文件**，逐处解决：
  1. `plugins/agent-box-harnesses/tests/test_capability_declarations.py`——扩展侧四个新家
     （dsh/qwen/kilo/claude-code）的 `deployment_document` 调用仍用旧 `artifact_source`
     宿主路径参数；按"44/45 接缝为准"重放到本分支的 token 合同（`artifact_token=`）。
  2. `docs/implementation/status.md`——两侧账本行都保留（本侧 44/45 行 + 扩展侧 43 行）。
  3. `docs/server-round1/fullstack/progress.md`——两侧追加内容都保留。
- 合并后复跑：8 家注册表（`load_builtin_registry` 列出全部 8 家）✅；
  `plugins/agent-box-harnesses/tests/` **195 passed / 3 skipped** ✅。

## 2. 阶段 A —— 安装集产出器（`scripts/server-round1/harness-install-set.py`）

- 遍历 8 家注册表，逐家构建或校验运行时工件并固定 tree digest；
  `--artifact <family>=<path>` 复用已验证工件；幂等：已存在且 digest 与上次记录一致的
  工件跳过重建（第二次运行 3 秒、零重建、deployment sha 逐字节一致）。
- **一份 deployment.json 装 8 家**（zero host paths：工件走 `--mount` 令牌绑定），
  `install-set.json` 记录每家的 mount 令牌、工件路径、凭据环境变量、原生模型值、
  入口、`models/<family>.json`。
- 运行（8/8 家全部出证，tree digest 逐家在档）：
  `codex 9051b844…`、`claude-code 3e28ead4…`、`opencode(c9485f62…，固定 1.18.21 单文件二进制)`
  `hermes 3ffa9ee4…`、`dsh 3297c3ed…`、`qwen eeae89ee…`、`kilo f46f1b4a…`、`pi afe238d3…`。
  与既有登记摘要逐家一致（codex `9051b844`、pi `afe238d3`、hermes `3ffa9ee4`、opencode `c9485f62`）。
- 产出目录：`/home/maoqh/.agentbox-all-harnesses/`（仓库外运行目录）。

## 3. 阶段 B —— 并存（G2 的 Server 侧第一手证据）

`scripts/server-round1/all-harnesses-coexistence.py`：
**一个 Server 进程、一份 8 家 deployment.json**（`build_runtime_from_sidecar_deployment` +
`--mount` 令牌绑定）上，`server.hello`（wire/1）✅，逐家完成
`workspaces.open` → `profiles.create`（8/8 全部 201）→ `providerModels.create`（8/8 全部成功，
`provider_<hex>` 逐家在档）→ 第二角色再建（8/8）。
证据 JSON：`docs/server-round1/fullstack/all-harnesses-coexistence.json`。

## 4. 阻塞账（§6/§7 格式）

```text
阻塞项：G3 逐家真实模型 UI 门（p42-ui-model-gate.mjs）
第一手观察：该门驱动真实 Windows Electron（`window.agentBoxDesktop.wire` 渲染进程通道、
`py.exe -3.12` Windows Server 启动器、taskkill 停止），本会话执行环境是 Linux/WSL 单机，
无 Windows Electron、无 py.exe。
为什么阻塞：外部资源缺席（Windows UI 会话）；工单 §3 明令前端仓只读、不得改前端。
已尝试：确认门脚本的平台假设（Windows 启动器/taskkill/wire 经渲染进程）后停手。
影响：G3 的 8/8 真实模型门无法在本会话产生；真实 DeepSeek 调用保持 0 次（授权未消费）。
不掩盖声明：本项不记通过。
```

```text
阻塞项：G3 并行双轮（45 的 G3）——同 Profile 并行 Session
第一手观察：同一 Profile 的第二个并行 Session 被
`TURN_CONCURRENCY_CONFLICT: Session or Profile already has an active execution` 拒绝。
为什么阻塞：Profile 级执行锁（run_state/native_generation）的放行是产品语义变更
（并行审计的合并规则、Profile 计数语义），需要产品裁决。
影响：45 的 G3 断言缺席（不影响 G1/G2/G4/G6/G8 的已通过断言）。
不掩盖声明：本项不记通过。
```

## 5. 未做项（逐条）

1. Windows 实机上的 G3 逐家真实模型 UI 门（8/8 矩阵）——外部资源缺席。
2. Windows r4(c9) 复跑（45-G5 的 Windows 腿）——同上。
3. G7 人手 UI 路径——同上。
4. §6 产品缺口（"这台 Server 装了哪几家"无上行面）——已按工单要求记录：
   影响是可用性在派发时才暴露（`HARNESS_DEPLOYMENT_UNAVAILABLE`）；
   可选方案（新增 `harnesses.list` 需重锁 wire / `hello.capabilities` 带只读清单 /
   拒绝提前到 `profiles.create`）交用户裁决；本单未实现。

## 6. 事实与清理

- 凭据零泄漏：本会话未读取任何凭据内容、未消费真实模型授权（0 次调用）。
- 清理：门自清理 + 临时目录在运行结束时删除；注入值不存在于仓库/Git；
  `git diff --check` 干净。
- 工作树外产物：`/home/maoqh/.agentbox-all-harnesses/`（deployment.json、
  install-set.json、models/、artifacts/）——安装集的设计位置，非仓库内容。
