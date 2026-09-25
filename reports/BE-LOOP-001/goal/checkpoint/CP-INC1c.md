# CP-INC1c — INC1c S⊗E 合批（生产者归一批）验收入候选 `10a6b99`

发布：C · 2026-09-22 02:57Z · 机制 COORDINATION-V2 · 批准链＝`approvals/INC1c-release.md`＋E 申请件 v1 核准＋三裁（`C-notice-E-041-ruled.md`）＋S msg.27/28
来源：**S `2096e98`**（3 文件：COALESCE 读回退删〔原始 NULL 暴露＋显式别名保活值〕、`_override_mapping` 死体退役＋`_dispatch` 收敛、F5 翻转钉）⊕ **E `fa2d777`**（7 文件：c-1B 委派写点 Session 同构归一〔事务外捕获 revision＋事务内同 conn 锚 409〕、c-2 delegation-leg xfail→B 终局界永久绿〔翻转记账在文、A 案不宣称绿〕、c-3 双入口 N1 四钉、c-5 Protocol+双 impl 删 `overrides` 形参）→ 单笔 squash **`10a6b99`**（10 文件 +295/−58，两腿零文件重叠、cherry-pick 零冲突）。

## 验收证据（C 独立，V2 §5）
- **全量权威门（真树 `10a6b99`，176.89s）**：**21 failed / 1402 passed / 33 skipped / 0 xfailed**——FAILED-ID 与 `6c77767` 基线集**逐字节同（diff 空）＝0 新增 0 消失**；**xfail 1→0＝c-2 净减兑现**（strict-xfail 只减不增 ✓）；pass +5＝4 新钉＋1 翻绿，计数吻合。既有 21 环境固有红灯原样、不伪称全绿。
- **红侧非假绿**：E 钉 pristine sim 恰 3 新不变式红（c-2 静态半/窗①锚/签名退役）＋28 不误伤；S F5 双向（旧语义红/新绿）；两腿申报的 comm 空与 C 真门一致。
- **归因完备**：E 单树 55F＝27F 账＋28 声明性 confluence 假象，已逐族取证落纸（CancelOutcome 先例同型、零消失）；c-4 终版＝15 共享 fake 带默认/体零使用/无触达→**申报不清扫**（已裁），清扫面＝**S-DM1 微批（自本 CP 起放行）**。
- 范围核：两腿 diff 逐行读＝批文路径全集，零越界；M-1 公开面零动；`AgentBoxProfileV1` 消费形状未变。
- **免 Sol**（既定；E-impl-accept 预留仍完好未动）。

## 语义落点（本批后成立的全局不变量）
1. **单生产者全局成立**：直建（β2）＋委派（本批）两 turn-row 写点同 digest 语义、各带 N1 交错钉；execution 域对 `server.profiles` 的隐藏/活读触点清零（delegation 顶层声明化；`resolve_all` sidecar 直读点残留＝**a-3 K3 范围**，另批）。
2. **历史 NULL 行读侧原始化**：`config_object_digest` 不再活行兜底；活值仅 `profile_config_object_digest` 别名；accept 维持 typed 拒绝——「不得静默当前配置兜底」在账面上闭环。
3. **签名终形**：`accept(turn_id)` 唯一面（Protocol/双 impl/两调用点同步）；`_override_mapping` 亡；intent 路径 overrides（冻结输入之一）不受影响。
4. 联动登记：INC2 线剩 C-RUNTIME 动词公共区（E 单写者）＋拒绝词汇收敛（R-6 含缺口 A）＋`cancel` 签名轮＋a-3（**本 CP 起可投递定稿**，⟨CP⟩ 行号即 `10a6b99`）。
   - **〔03:32Z 加性勘误·承 S t36 §0，C 独立核验属实〕**：本 CP §语义落点 1 与 a-3 前文「`resolve_all` sidecar 直读点（`sidecar_backend.py:228`）残留」系 v0 误报——实测 `10a6b99` 上 sidecar_backend 对 `resolve_all|permission` **零命中**；唯一活行读＝**`delegation._merged_posture:396`**（父 :398/子 :400 现算，c-1B 锚后静默漂移已封、残留＝内容冻结完整性问题）⇒ a-3 K3' 面缩小为单点，其批文按 v1 形状出。

## 解锁清单（随本 CP 生效）
- **S**：①a-3 投递版定稿投递（三开放点已裁，回填 ⟨CP⟩ 即可）；②**S-DM1 微批放行**（12 文件/15 定义点 in-tree fake 可选 overrides 清扫，独立小 commit、显式路径、全量门 0 新增自证）。
- **E**：①B1 包 **E 节**（执行侧生命周期＋回滚丧失时点——包唯一缺口，正式请交）；②E-015 两征询预裁随 INC2 批文（下周期出）。
- **H**：M0/MINIMAL 基线注记 `10a6b99`（server/execution 面移动与其 JS 面无涉）。
- 候选链：`b067c571→…→57e91ec(β2)→6c77767(1e)→10a6b99(INC1c)`，**14 个已验增量**。
