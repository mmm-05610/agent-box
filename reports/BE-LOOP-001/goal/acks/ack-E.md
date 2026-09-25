# ACK execution (E) — 收到，非批准

- 收到：E `status-goal.md` DESIGN_READY（design v0）+ `E-R1`(研究) `E-P1`(四类职责+五攻击) `E-D1`(接口差量) + outbox `goal-execution-E-001.md`。
- C 评价：四类职责表 + 五攻击逐条有 file:line 证据、诚实标注「场景内收敛非全局最小」、主动把 ACP/资源/删除策略移出 E——质量高，认可。
- **已发布 `C-EXEC@v1(block1)`**（`contracts/C-EXEC-v1-block1.md`），含 C 裁定 O-3（port 载体加性演进）与 M-1（本轮不新增公开 reason，公开冻结）。
- **已批 E-INC0**（`approvals/E-INC0-pinning-tests.md`）：先落五攻击钉住测试到本组 `/tests`（不写产品、不改公开、不需 Sol#1）。
- **Sol#1 未花（预留中）**：E design-final 需 H（`C-HARNESS` H-1..4：sessionUpdate/stopReason 判定/usage 家族/whole_db 声明）与 P（`C-RES/C-RUNTIME` P-1..6：端口形状/凭据删除/entrypoint/双 IsolatedProcessSpec 合并/wrap 副作用承诺）确认后才定稿 → 届时 C 用真 `codex review -c model=gpt-5.6-sol` 核验，再批 E-INC1 产品实施。
- 确认请求已转 H/P，见 `contracts/interface-requests.md`。**P-4（双 `IsolatedProcessSpec` 同名异构）由 C 裁定词汇归一**：留待 E design-final 议题，C 倾向「保留 `runtime_composition` 侧中立 spec，`sandbox_port` 侧降为 provider 局部」，但须 P/H 证据支撑后定，不在本轮硬裁。
- E 下一步：做 E-INC0 钉住测试并交 CHECKPOINT；等待期继续不依赖审批的组内工作；不据草案开工产品码。

## 更新 17:49 — 接受 E design v1（C 亲审）+ 依赖解阻
- 收到 `E-D2-design-v1.md`（E-005）+ `E-004` E-INC0 CHECKPOINT。**C 已自审：v1 高质量**，逐条闭环 6 反例，且把外依赖显式列为**契约请求**（正是 v0 之败的教训）。
- **E-INC0 接受**（21 passed / 5 strict-xfail，无产品差量；xfail 即 INC1a 验收单，非弱化）。
- **外依赖解阻（C 通知）**：
  - `[待P·P-5]` **已答**（P 07-ifr05 分级：目标零创建成立、provider 登记不原子、P 插件内自补偿 D6/D7）→ E §1 采「先行登记兜底 + 若发布可执行零副作用契约再降级」即可，**E 不建失败登记路径**。
  - `[待P·P-1]` **已答**（terminate 经 `HostTransport.submit(transport_kind="terminate@1")` 加性表达，无新 SPI）→ E §4「撤 Job 缝、走迁移门」成立。
  - `[待H·bundle 布局]` **C 裁定归属**：sidecar/bundle 运行时内容布局**归 H**（见 H5），物理挂载根归 P，E 只传不透明 `bundle_ref`；E 删全部 `agentbox-sidecar/runtime/` 字面量（INC1a）。
  - **C 将发布**：`release/terminate` 动词进 Protocol（C-RUNTIME/C-RES，公共区，先于 E-INC2）、`RoomProcessSpec` 改名（P-4）、`C-HARNESS` bundle 内容节（H-PLAN/draft-1 基础上）。
- **下一步**：E 把上述折入 → **声明 design-final** → C 从**机动额度**花**一次**真 Sol 复核 design-final（#1 已在 v0 花于 reject；E impl-accept #2 仍预留），通过即逐路径批 **E-INC1a**（E 中立 `ExecutionRequest`+三态端口+词禁断言，纯 E 文件）。E-INC1b（S 适配器）随 S-block1。
- E-INC1 仍不批、不动产品码，直至 design-final Sol 通过。

## 更新 18:42 — goal-execution-E-008 收讫（对 Sol#2 三门的 v2 应答）
- 收到 v2 三产物：`E-D2 v1.3`（`e3cc5403…`）+ `E-INC1a-path-request-draft v2`（`9f0d5401…`）+ `E-R3 crosswalk` 校准。三门应答逐条核：#2→a-6（`closure=None` 纯数据参、零可达结构钉+零增长词禁、兼容壳随 IFR-04 最迟 INC1b 删=**案B，已裁**）、#3→a-3（零 Core 铸造，`execution_key` 由 S 建档后签发）、#5→补充A observe 契约（纯读零下发、`NOT_KNOWN≠未启动`、探测式对账移出 INC1a 随 IFR-04）——**均与我 `approvals/E-INC1a.md` 一致，无新裁项**。
- **INC1a 已批准生效**（上条 18:08）。E 现处实施期（源树未提交文件恰为 INC1a 范围，已核）。继续 a-1/a-2→a-3→a-6→a-4 同批，交 CHECKPOINT 时跑：26 既有钉（5 xfail 转绿不弱化）+ 仓内基线 + S 公开形状锁 4/4。CHECKPOINT 到手 C 核范围+真跑差量（集成参考=候选 `4917f56` 上 server execution/cancel/approval+runtime_composition 7P/1skip/0F，落地后须 0 新增失败）→ **通过后花 E impl-accept 预留#2 真 Sol 验收** → 触发 S-block1。
- 对 H 的 IFR-04 精确化（C-HARNESS 补「原生只读探测腿」+「bundle 声明 closure 条目」两节）：接受，记为 C-HARNESS@v1 后续小节需求（不阻塞 INC1a，H 侧由 C 归集）。Sol 无新增请求（正确；impl-accept #2 语义不动）。
