# BE-LOOP-001 bootstrap · status

当前状态：**READY_FOR_I_REVIEW（修订版）**
时间线：
1. 复用结论 → **I 批准复用方向、授权实施 A–E** → 本轮已交付 A–E。
2. I 复审**暂不通过正式启动验收**，给出四缺陷 + G1/G2 修正指令 → 本轮**只修四缺陷 + 交 G1/G2 方案**；未启动真实四组、未消耗 Sol、未改产品代码、未做特权网络改动。

## 本轮修复（已端到端实测，`selftest/checks.md` 49 项全 PASS）
1. 重复 request-id **绝不再调 reviewer**（consume 三态退出；假 reviewer 调用计数为证）。
2. 实施挂载由 **APPROVED 记录 + impl-allow.map** 生成并校验；拒绝任意宿主路径/遍历/跨组/错配。
3. reviewer 输出精确核对候选 sha/task/milestone/version；非零退出/错版本/错里程碑/无效 JSON 不批准。
4. 全部状态转换入控制器单实例锁；resume 不降级；stop 按 pid+start-time+cmdline 核验身份，PID 复用不杀。
- 未扩控制器，仅定向修复。

## 验证三态（勿混淆；49/49 ≠ 整条启动链通过）
- 假执行者：控制器/边界/预算/幂等/恢复/批准链 **已验证**。
- 真实 Qoder 进程联网取模型：**尚未验证**（G1/G2 未决）。
- 原生长期调度（真机唤醒/重叠/会话恢复）：**尚未验证**。

## G1/G2
见 `../../backend-loop/isolation/g1-g2-access-proposal.md`。诚实声明：**只读挂载 ≠ 秘密不可读**；本机无 pasta/slirp4netns，宿主有现成 7897 代理但 `--share-net` 会暴露回环服务。未装组件、未做特权网络、未建大代理、未起真组。

## 需 I 决定
认可四缺陷修复为逻辑基线；G1（批准一次性装 pasta/slirp4netns 或明示 BLOCKED）；G2（受限 key + 私有 config-dir 的泄露半径，或指定代持）；批准后首组真实启动兼作 Sol 首次可用性验证（不做额外收费探针）。
边界不变，**不自动进入正式运行**。
