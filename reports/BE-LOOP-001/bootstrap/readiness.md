# BE-LOOP-001 启动准备 · readiness（一页）

状态：**READY_FOR_I_REVIEW（修订版）**　角色：中央 C　日期：2026-09-22
本轮：按 I 复审**只修四个代码缺陷 + 交 G1/G2 方案**，**未启动真实四组、未消耗 Sol、未改产品代码、未做特权网络改动**。
详见 `bootstrap-report.md`、`selftest/checks.md`、`../isolation/g1-g2-access-proposal.md`、`native-untested/`。

## I 复审四缺陷 —— 已修 + 端到端实测（假执行者/假 reviewer）
1. **重复 request-id 仍调 reviewer**：`budget consume` 现三态退出（0 新获配 / **10 已有请求** / 其他 拒绝）；`sol-review` 对 exit10 **绝不再调** reviewer。端到端用**假 reviewer 实际调用计数**验证：dup→calls=1、used=1（`CTL-dup-nocall`、`CTL-dup-used1`）。
2. **impl 挂载盲信 `BE_LOOP_IMPL_BINDS`**：改由 `impl-binds.sh` 从 **APPROVED 记录**生成并按 `impl-allow.map` 校验；`sandbox_build` 再核 host∈source、target=/source/<同rel>。拒绝：任意宿主路径、`..` 遍历、跨组非白名单、公开 `server/wire` 等 deny、host/target 错配（`D2-*`）。
3. **reviewer 输出未核对**：`sol-review` 现精确比对候选 **sha256、task、milestone、contract_version** + schema；**非零退出、错版本、错里程碑、无效 JSON 一律不批准**（仍计次、回退 CENTRAL_REVIEW）；全字段匹配的 ACCEPT 才 APPROVED，合法 REJECT 回退（`D3-*`）。
4. **并发/状态/停止未保护**：start/stop/resume/approve/collect/checkpoint/sol **全部**入控制器单实例锁（并发 start 仅 1 条 pid 记录）；`resume` **不再无脑降级为 RESEARCH**（保留原状态、同阶段重启）；`stop` 按 **pid+start-time+cmdline** 核验身份，**PID 复用/外来 pid 不杀**（`D4-*`）。
自测：**49 项全 PASS**（`selftest/checks.md`）。

## 验证三态（明确区分，勿混淆）
- **假执行者已验证**：控制器逻辑、隔离边界、预算闸门、幂等/去重、崩溃恢复、批准链 —— 49 项。
- **真实 Qoder 尚未验证**：真 `qodercli` 进程在沙箱内起、联网取模型、读私有 config-dir —— **未测**（G1/G2 未决，本轮禁真四组）。
- **原生长期调度尚未验证**：`/loop`/durable cron 的真机长时唤醒、重叠触发、真会话恢复 —— **未测**（`native-untested/`）。
> **49/49 只代表控制器与边界的逻辑验收，不代表整条启动链通过。**

## G1/G2 方案（已交 `g1-g2-access-proposal.md`，未实现）
- **G1**：本机无 pasta/slirp4netns；`--share-net` 会暴露宿主回环服务（排除）。最小可行=**一次性装 pasta/slirp4netns**（rootless 出站 NAT，独立 netns 屏蔽宿主 127.0.0.1），否则 G1 **BLOCKED**，不开全权限绕过。残留：无白名单时是广域出站。
- **G2**：qodercli 无 env-token，凭据为 config-dir 文件。**只读挂载 ≠ 秘密不可读——执行者 shell 仍可读**。最小=专用私有 `--config-dir` 放**受限/短 TTL/可吊销** key（不含主凭据、不含 Sol）；真"可用不可读"需 egress 侧代持 auth（后续）。

## 需 I 决定
1. 认可四缺陷修复与 49 项自测为逻辑基线。
2. G1：批准"一次性安装 pasta/slirp4netns"作为单组最小联网，或明示 BLOCKED。
3. G2：认可"受限 key + 私有 config-dir"路线及可接受泄露半径，或指定代持代理。
4. 首组真实启动 = 兼作 Sol 首次可用性验证（不做额外收费探针）。批准后再按启动顺序开研究阶段。

边界不变（组织边界、物理隔离、后端十次 Sol 预算）。本轮**不自动进入正式运行**。
