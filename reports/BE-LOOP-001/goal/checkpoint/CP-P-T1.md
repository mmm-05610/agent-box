# CHECKPOINT CP-P-T1 — P-T1 integrated into candidate (真实验证+集成)

> ⚠️ **已撤回（18:12）**：集成验证跑「受影响插件的既有测试」发现 P-T1 引入 **2 处回归**（含 1 处安全护栏削弱），已从候选 `4674a2a` **reset 回 `b067c571`**。详见 `decisions/P-T1-regression.md`。本文件保留作过程记录，**不再作有效检查点**。根因教训：接受增量须对**既有**相关套件做 baseline↔candidate 差量跑，不能只跑新增测试。

- 组：platform · 增量：P-T1（D1/D2/D5）· 批准：`approvals/P-T1-idempotent-cleanup.md`（未用 Sol）· 方案：P-DESIGN@v1
- P 分支提交：`218ef4c5`（基于 b067c571）
- **集成后候选 SHA：`4674a2a14910aa0d7967a6d175293a7d30df68e8`**（`integration/linux-native-0`，cherry-pick 自 218ef4c5）
- 回退点：`git -C integration reset --hard b067c571`（本候选仅此前进此一并入提交，无他人工作混入）

## 验证范围（C 亲做，非二手）
1. 代码复核 3 个方法体：护栏**未放宽**——git containment 保留 + 「worktree 在/marker 无」仍 raise；tmux 用 `has-session check=False` 先探（C 指定方案），已亡不 kill；bwrap 仅按 token pop `_secret_attempts`，不读秘密。
2. **真实 pytest 执行**（集成 venv，pytest 9.1.1）：
   - 在 P 分支树上跑 3 文件：**6 passed**。
   - 集成候选上再跑：**6 passed**。
3. 范围核对：`git diff --stat b067c571 HEAD` = 恰 3 源文件 + 3 测试文件，182 insertions/2 deletions，**无越界、无跨组路径**。

## 已知缺陷 / 分级
- D5：tmux server 整体不可达 与 仅会话亡 未细分（has-session 皆非零→判 destroyed=False）；direct-stdio/bwrap 不受影响。留观，若 E 消费侧需区分→第二契约面议。
- 真机 tmux 未跑（无 pytest 环境外的真 tmux）：**机制/夹具证明 ≠ 真机证明**（D-0015 分级）。
- 本增量无消费侧可观察契约变化（内部幂等收敛），E/H 无需改动即受益于重复清理不再抛错。

## 交叉影响
- 未改公共出口/签名/capability → 不触 `C-RES/C-RUNTIME` 发布。
- 后续：P **D3**（git 部分失败孤儿）第二增量；E design-final 的 P-1..P-6 确认（IFR-05）仍在途。

## 派发
- P：批准实施 **D3 第二增量** 的研究/草案先备（不写产品，等逐路径批）；同时答 IFR-05 的 P-1..P-6（端口形状/凭据删除/entrypoint/双 spec/零副作用承诺/归属次序），以便 E 定稿→Sol#1。
