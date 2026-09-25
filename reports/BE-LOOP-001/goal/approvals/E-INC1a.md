# APPROVED — E-INC1a（execution 中立执行契约 + 三态端口，E 域）

批准者：中央 C（依 `sol/E-design-final-002-decision.md`：设计概念经真 Sol#2 接受，C 决定范围修正后**亲审批准、不再花第三次设计 Sol**）。真实批准。
- 组 execution · 任务 E-INC1a · 方案 **E-D2 v1.2（design-final）+ INC1a draft v2（18:04）** · 契约 `C-EXEC@v1(block1)`、引用 `C-RUNTIME@v1` · 基线 b067c571 · 分支 `work/be-goal-execution-0`
- Sol：本批准**未花**；**E impl-accept 预留 #2 于实施验收时**由 C 花（见 §验收后）。

## 三 gate 闭环确认（C 亲读 E v2 草稿）
1. #2 → 新增 **a-6** `execution/sidecar.py`：`closure` 纯数据拼装 + `closure=None` 字节兼容壳 + **零可达结构钉**（新 E 代码与 `execution_contract.py` 对 `agentbox-sidecar/runtime/` 字面零可达）+ 零增长词禁。**C 裁壳删时点 = 案 B**：INC1a 仅落 a-6 切断 + 零增长锁；兼容壳**最迟随 INC1b / C-HARNESS bundle 声明定稿删除**，不由 E 单方定。
2. #3 → a-3 **零 Core 铸造 / 零 Core 读取**；`ExecutionRequest` **无 objective 字段**；`execution_key`=S 建档后签发的幂等键、`correlation` 不透明透传、落库归 S。✓
3. #5 → `observe_execution` 定义（E-D2 补充 A）：纯读在飞注册表 + on_event 证据流、**零下发**、缺键 `NOT_KNOWN_TO_E+NONE`、证据单调态不回退、永不写账本；「探测式对账」**移出 INC1a**；R3 crosswalk 把 R4/R5/R8/R9/R11 列为 INC1a 新增钉、R10/R6/R7 为既有 xfail 转绿。✓

## 批准写入范围（逐路径；仅此，越界即驳）
`src/agent_box/server/execution/` 下：`execution_contract.py`(新) · `__init__.py`(加性协议方法，bool cancel 原样) · `sidecar_backend.py`(实现三方法，accept/cancel 字节兼容) · `sidecar.py`(a-6) + `execution/tests/`（`test_e_inc1a_matrix_pins.py` 等）。
**不得触碰**：`execution/protocols.py`、`extensions/api.py`、`runtime_composition/**` 冻结签名、`bootstrap/**`、`work_core/**`、公开 Wire/REST（M-1）、S/H/P 域文件；`:228 resolve_all` 直读**保留**（INC1c 删）、`_CLEAN_STOP_REASONS`（已转 S 自管）、credential disposition（P-2 成文不改码）。

## 验收（CHECKPOINT 必交，C 核 + 真跑）
- 真跑 `pytest execution/tests/`：**0 failed**；R3 crosswalk 中 INC1a 归属的 🔒/⬜（R4/R5/R6/R7/R8/R9/R10/R11）转绿；**xfail 仅剩 INC1b/1c 归属项**，无弱化为通过。
- **零可达结构钉** + 零增长词禁通过；**探测禁则钉**（observe 期间 port 下发数恒 0）通过；R5「无未启动证明不得把 unknown 洗白成 refused」钉通过。
- S `test_block1_cancel_public_shape_s.py` **4/4 仍绿**（永久公开形状回归锁，不得为转绿改）。
- 逐路径 diff + 测试命令/实际结果 + 已知缺陷 + 交 S(INC1b)/H(bundle 字面收敛) 交接说明。分级：机制/夹具 ≠ 真机。
- 通过后 C 集成候选（现 `4674a2a` 续接）→ **花 E impl-accept 预留 #2 真 Sol 做实施验收** → 再放 S-block1 四处切换 + INC1b。

## 派发
E 即刻按上列实施 a-1..a-4、a-6（案 B），交 INC1a CHECKPOINT。INC1b（S 适配器）/INC1c（删 resolve_all+删壳）仍候各自批准与合流次序（1a→Sblk1→1b→1c）。
