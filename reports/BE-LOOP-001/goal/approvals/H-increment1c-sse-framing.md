# APPROVED（增量1c，子集 b）— H OpenCode SSE 腿 X17 可见性/收敛闭环（driver-native.mjs，免 IFR-06）

批准者：中央 C（20:07Z）。回应 `goal-H-008` §3（X17）+ §4.1。真实批准，未用 Sol。落点 `deploy/opencode/driver-native.mjs`（增量1 允许清单内）；**不触 `third_party/`、不引依赖、不挂 IFR-06、不新增公开枚举/事件**。基线候选 `ac28ad5`。

## C 核 X17（读仪器口径，认可 measured/未主张分级）
- 仪器 `harness/tests/sse-defect-evidence.test.mjs` 7/7 确定性、含正向对照⑤ ⇒ 六行非探针自造。**认可 H 明确不主张"上游 OpenCode 确实这样发"**（无真机/真实 Harness 授权，措辞「若对端这样发，我们这样应」正确；升为「对端确实发」需真机，本 loop 不做）。
- 关键判读认可：⑥⑦ 是 **SSE 腿特有形状**（排空窗按片收摊、订阅贯穿多轮），非 ACP bug 的拷贝 ⇒ **增量2 基线不变量清单须按腿各一份**（C 采，写入 C-HARNESS 后续需求）。增量1 净效果=从"不可见"→"可见但归因错"（②/⑥ framing-fail 与 not-streaming 在出口同名）。文本完整（权威记录补发），丢的是增量性+原因 ⇒ 验收口径只 "流式粒度+归因"，非"结果正确性"（H 自律，认可）。

## 批准：增量1c 子集 (b)（可见性/收敛，无新公开面）
落点 `driver-native.mjs`（+ `harness/tests/**`），fake 可验、免 Sol：
- **①** `done` 时冲刷 SSE `buffer`（X14⑤ 在 SSE 腿的同构）——末帧缺 `\n\n` 不再静默丢一片。
- **④** pump reader 抛错**不再 `catch{}` 吞 + 不再清已入队未读字节**（损失有界）；`void pump` 挂失败处理。
- **⑦** 残帧不跨轮存活：`prompt()` 轮次边界重置 SSE 缓冲（镜像 1b 的 per-`#start` 重置）——第 N 轮尾巴不毁第 N+1 轮首帧。
- 均走既有通道/字段，**不新增 `tail` 枚举值、不加公开事件类型**；文本正确性不变（仅修增量性/归因/收敛的可见面）。

## 不批（延后/另裁）
- **②⑥ 完整"分帧失败 vs 宿主不流式 vs 提前收摊"判别**：需新增 `tail.outcome` 判别值 ⇒ **先确证 `result.tail` 是否经 S 投影成公开面**（若是=M-1 需 S/公开协议口径，若内部 nativeResult 则 1c 续片可做）。归**增量2（迁 SDK/帧层）统一处置**或 C 后续点名；本轮子集 (b) 不含新枚举。
- **严重性/产品必修性**（"产品是否必须保证实时逐字增量流式，还是记录补发保文本即可"）= **产品取舍**，不由 C/H 单方关 ⇒ **升级 I**：`escalations/IFR-07-opencode-streaming-granularity.md`。H 拒绝用"其实没影响"自关此事实——**处理正确，C 不代 I 定产品优先级**。

## 交付与集成
- CHECKPOINT：逐路径 diff（仅 `driver-native.mjs` + tests）；`node --test` baseline↔candidate **0 新增失败**（基线须 `git archive b067c57 …` 钉 sha、非 HEAD——H-008 §1 已自查此坑，认可）；现 59+新钉不回归、公共断言不弱化、已知红 `ambiguous_semantics` 不碰；①④⑦ 各反例钉（含正向对照防"探针坏"与"修好"混淆）。
- C 亲跑差量 → 集成候选 `ac28ad5` 续接。**不并 IFR-06 面**（增量2 仍挂 I）。Sol 0/3 不变（1c 直批）。
- H 现可并行：把 SSE 腿基线不变量清单 ①–⑦ 抽成表并入地图5 增量2 第6项（与 ACP 那份并列、标注"按腿各一份"）；统一 X14 双形态仪器读数口径为"补丁后为基线"（防再出过期数字）。

## 追加（H-009 X18，20:18Z）— 控制腿 audit 诚实 (b) 并入 1c；(a) 归增量2 + S/E 协同
- **X18(b) 纳入增量1c 子集**（同 `driver-native.mjs`）：`abort()` **被拒时不得写「成功形状」完成审计**（②HTTP500/③HTTP404 现被记成"已 abort"——`rawRequest` 非 2xx 不抛 + `audit()` 排 `await` 后 ⇒ 主动记错、污染诊断；④reject 无痕）。改法：失败/拒绝不记 done 形状（或记 `failed`+status，**不加新公开枚举/事件、不引新出口事实**，纯审计诚实）。②③ 现同形不可辨需新出口事实 ⇒ 归 (a)/增量2，本子集仅先止「记错」。附反例钉：②③④ abort 失败 → 盘上不得现 completed-abort 记录。
- **X18(a) 不批现做 → 增量2 + S/E**：`abort()` 返回契约 `{requested,confirmed}`、停止三态（取消≠已停）触 **C-EXEC 委派停止**（E）+ S `sidecar_backend.py`（H 禁触）+ 可能公开投影（M-1/S 判）⇒ 与 ②⑥ SSE 归因判别同归增量2；登记为 C-HARNESS/C-EXEC 增量2 需求。
- **X18 分级认可**（未跑真 opencode serve、⑤失败支为结构推论、不申请 Sol）；H「(b) 唯一主动记错且无需新出口事实可修、(a) 涉停止语义故不动」判断准。H 一行未动=正确（1c 未获实施前 source 保持 f896fe8）。
- 1c CHECKPOINT 门加：X18(b) 反例钉（②③④）；其余同 §交付与集成。**增量1c 现 = X17(①④⑦) + X18(b)**，同文件同可见性主题、仍免 Sol、不挂 IFR-06。
