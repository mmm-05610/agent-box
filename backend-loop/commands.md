# 经核实的启动 / status / stop / resume 命令

中央 C 使用 `control/backend-loop/controller/be-loop.sh`。本轮**只有 FAKE 执行**（`run-group.sh` 拒 REAL，见下）。
每条命令的真实输出摘自 `selftest/` 与本文附的实测记录（无模型、无 Sol）。

## 中央控制器
```bash
cd control/backend-loop
bash controller/be-loop.sh status                 # 一页：基线/四组阶段/Sol used·预留·机动/阻塞
bash controller/be-loop.sh collect                # 幂等读各组 outbox，按 msg id ACK，不重复派工/review
bash controller/be-loop.sh approve <group> <task> <src-relative-path>...  # 逐条按 allowlist 校验后写 APPROVED（C-only，开放实施路径）
bash controller/be-loop.sh checkpoint <group> '<json>'                    # C 在沙箱外记录检查点
bash controller/be-loop.sh sol-review <group> <request-id> <milestone> <candidate-file> [task] [contract-version]  # 唯一 Sol 入口
```
`sol-review`：`budget consume`（新获配/重复/拒绝三态）→ reviewer → **精确核对**候选 sha、任务、里程碑、契约版本
→ `record` → 仅"全字段匹配的 ACCEPT"才 `APPROVED`。重复 request-id **绝不再调** reviewer（exit 10）。非零退出/错版本/
错里程碑/无效 JSON 一律不计为批准（仍扣账）。本轮 reviewer=`tests/fake-reviewer.sh`（无模型）；**REAL codex review 未授权**（返回 77）。

## 单组启动 / 停止 / 恢复
```bash
bash controller/be-loop.sh start  <server|execution|harness|platform> [research|impl] [task]  # 独立 bwrap 内独立进程
bash controller/be-loop.sh stop   <group>          # 只杀身份核验通过的自有进程组（PID 复用/外来 pid 不杀）
bash controller/be-loop.sh stop   --all
bash controller/be-loop.sh resume <group>|--all    # 未 DONE 且 pid 已失 → 同阶段重启（不降级状态）
```
实测：`start harness`→`RESEARCH`+pid；`status`→其余 IDLE、budget 0/10；`collect`(DESIGN_READY)→`ACK`+`CENTRAL_REVIEW`；
`resume`(pid 已失)→同阶段重启并保留 `CENTRAL_REVIEW`。`start/stop/resume/approve/collect/checkpoint/sol-review` 全在**控制器单实例锁**内串行（并发 start 只留 1 条 pid）。`pid=-` 因 FAKE 瞬时退出；真 `qodercli` 会常驻。

## 直接起沙箱（调试用）
```bash
bash isolation/run-group.sh <group> [research|impl] [approved-task]   # 默认 FAKE
# impl 必须给 APPROVED task：绑定由 isolation/impl-binds.sh 从批准记录生成并按 permissions/impl-allow.map 校验，
# 拒绝任意宿主路径 / 目标错配 / 越权 / 遍历（缺陷2 闭合）。不再接受自由 BE_LOOP_IMPL_BINDS。
BE_LOOP_DRYRUN=1 bash isolation/run-group.sh <group> research         # 只打印 bwrap argv
```

## 独立预算账本
```bash
python3 controller/budget.py status
python3 controller/budget.py consume --group {S|E|H|P|central} --milestone <m> --request-id <id> --model gpt-5.6-sol
python3 controller/budget.py record  --request-id <id> --result ok|rejected|error|timeout
```

## REAL 四组启动：本轮关闭（明确）
```bash
BE_LOOP_REAL_LAUNCH=1 bash isolation/run-group.sh <group> research
# 现返回 77 并说明：需 (1) I 批准的正式启动；(2) isolation.md 缺口 G1（网络出口）与 G2（最小暴露认证）已解
```
在 G1/G2 未决前，C **不放行共享宿主网络**（那会暴露回环服务），不手工复制秘密——按约束"报告、不绕过"。

## 验收自测（无模型、隔离临时账本/临时源码）
```bash
bash tests/run-selftests.sh        # 49 项 PASS/FAIL → reports/BE-LOOP-001/bootstrap/selftest/checks.md
```
