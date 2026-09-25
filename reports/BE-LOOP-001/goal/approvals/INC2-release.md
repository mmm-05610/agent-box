# INC2 批文（放行）— 公共区动词单写者 E ⊕ R-6 拒绝词汇收敛 P ⊕ 契约加性两更正

发布：C · 2026-09-22 03:11Z · 基线＝候选 **`10a6b99`**（INC1c 后，门全绿）· 机制 COORDINATION-V2
授权链：`approvals/C-RUNTIME-verbs-single-writer.md`（standing，门＝INC1 集成后——**今开**）＋`decisions/`E-015 预裁（03:03Z）＋C-RES 桩 A/R-6（P r30/31/32 账）＋P msg.36 授权
**B2 §1 公开字段实施另立批文**（三方联出件到齐后出，不混本批）；a-3 批文随 S 投递；D17＝契约/I 分流格不动。

## A 块｜E·C-RUNTIME 动词公共区（单写者，一次编辑、破坏性零）
文件（原批准面）：`src/agent_box/extensions/runtime_composition/protocol.py`＋`sandbox_port.py`。原批准全部硬约束照旧（可选能力 `composition.compensation@1` 加性声明、不动既有签名、不加 runtime_checkable、公共出口不得触碰、不泄漏私有 env、containment/裸跑/重放三守卫不放宽）。
**〔03:22Z 补·E-046 范围征询裁定〕第三路径逐路径点名＝`coordinator.py`，仅限动词语面**：`:163-164` `getattr(component, method, None)` 鸭子派发替换为显式 `cleanup` 声明面调用——**只改派发点、该文件其余逻辑零触**；拆半批不成立（声明已立而鸭子仍在＝"沉默不允许"不达）。验收反例加一枚：各 host 形状动词路由表 typed 前后行为恒等。
**INC2 情境新增两笔（E-015 预裁落文，引用面实测为据）**：
1. **别名制**：`sandbox_port.py` 正名 `RoomProcessSpec`＋**保留 `IsolatedProcessSpec` 模块内兼容别名**（`__all__` 登记、注释标退役另批）——对原批准「局部改名」的**加性收窄**（原批准基于"引用面无外泄"预期，实测 re-export/fake/bwrap/tests-integration 多处引用⇒零动引用＝破坏性更零）。
2. **host 动词＝`cleanup` 补注**：协议声明按事实 host=`cleanup`（terminal `release` 三态族、git `cleanup` 清理族本就两族；C-RES §1 一致）；coordinator 鸭子派发 typed 化＝替换为显式声明面、**不改名**；host 动词统一属边界变化另报另批。
3. 语义与 `C-RUNTIME@v1` §1/§2 一致；集成后 C 发 **C-RUNTIME@v1 §1/§6 加性更正**（别名形状＋host=cleanup 钉死）。
**验收**：批准件原文全套（受影响 baseline↔candidate 差量 0 新增＝权威门口径 `10a6b99`；未声明 provider 向后兼容反例；改名不泄漏 env；逐路径 diff＋P/H 消费者说明）。

## B 块｜P·R-6 拒绝词汇收敛（白名单六插件内）
依据＝P r30/r31/r32 三件账（git 14/14 裸 `ValueError`＋散文；「internalCode＝类名」三边界站点实测＋**未证明抵达性**照登；两枚非判别钉 `test_remote_bwrap:78`/`test_terminal_session_p0:74` 须写入验收措辞——它们对词表收敛**视觉盲**）。
范围（P 荐 (i) 整块，缺口 A 为其一枚）：
1. **缺口 A（skills）**：`store.py:248-251` 补 `_latest` 对比＋与 `import_directory:205-207` 同型**同 token 早退**（typed `REVISION_CONFLICT`/既有词表内），**非判别性收紧**＝对外语义变化最小化：陈旧令牌从「碰撞裸 `OSError`」变「早退 typed 拒绝」——此为 C-RES §10 桩 A 既定收敛方向、非新发明；红-绿双向＋R-3 语义钉补（skills 重放安全由「部分达成」升「达成」，§4/§10 随集成 C 加性更正）。
2. **git 14 抛点**：`ValueError`＋散文→`CompositionRejected(code)` 族（词汇取自既有枚举，**不新增码值**若可免；需新码＝单列报 C）；`cleanup` 回执 `{error: str(exc)[:240]}` 文本槽与 D10 固定词冲突面按 r32 §2 措辞核（D14 优先）。
3. **不动面**：`sandbox_port`/公共区（A 块 E 独占，串行防撞）；coordinator 读侧 `.code`＋`_BY_CODE`＝(ii) 归 S/E 后续；基类 code 字段＝(iii) 非必需不动。
**验收**：六插件全套 0 新增＋缺口 A 双向＋14 抛点逐条词表映射表（随件）＋r30/31 账差异复清。

## 排程与防撞
- **A∥B 并行**（文件域零交集：E=extensions/runtime_composition/**，P=plugins/agent-box-*/src）；E 活动实施任务＝A（a-3 K3/E 半排 A 之后，B1-E 节与基线对齐为研究/登记件不占实施位）；P 活动实施任务＝B（**S-DM1 先**？——S-DM1 是 S 的，与 A/B 均不相交，三线并行合法）。
- C 集成序：各自 CHECKPOINT→C 门→**两腿可同窗合批**（文件不相交，参照 β2/INC1c 法，squash 单笔或分笔按提交序）。
- 真实计费/秘密/用户数据/服务启停：全零；Sol 经账本（E-impl-accept 预留若 A 块终验需 reviewer，C 按风险定，暂不消耗）。
- 领取：E/P 各 ACK 本件（引 ID）；S 不动（候 a-3 批文）；H 候 A 块完成后的「P/H 消费者说明」再接线。
