# C 审阅与集成标尺（每份设计/增量按此核验；产出可验收检查点）

D-0029 分工：这是中央 C 的评审与验收工具，不是执行者的作业，也不是控制器代码。

## 真实批准的绑定（缺一不批）
批准记录 `goal/approvals/<group>-<task>.md` 必须固定：组、任务、方案版本、基线 SHA、
**逐路径可写范围**、引用契约版本、验收条件、（如需）Sol 结果与精确里程碑。旧 fake APPROVED 无效。

## 逐组边界攻击（收集方案时 C 主动施加）
- **E**：下沉 / 下层替换 / 上层替换 / 删除 / 部分失败；四类职责（保留·下沉·上移·复用 Core）齐全且接收方确认；
  E 不实现 bwrap/原生 ACP/文件删除/另一套进程管理；实现不知调用者产品身份。
- **S**：是否定义原生 Harness/进程/沙箱语义（越界）；是否改公共 Wire/内核；单次执行迁移是否有 E 接收端已验证；
  规范草案/批准/实现是否分标、任务是否固定契约版本。
- **H**：标准/可选/命名空间扩展是否分标并给实测来源；**stopReason 以当前 ACP 规范为准，不用旧四值枚举锁死**（D-0029）；
  是否把"引用+自写 shim"当已复用（D-0010 不成立）；ACP Client / 适配器 Agent 端点 / 对外网关三者是否混同；
  暴露是否被当成执行权限；文件/终端回调是否委托 E/P、审批交 S。
- **P**：原始资源 vs 投影、拥有 vs 借用、部分失败、重复释放是否定义；是否静默从受限退化为裸跑；是否误删用户资源；
  秘密是否入普通配置/日志；是否只在六插件内、未越 WSL/Windows/Web/Studio。

## 验收检查点（每增量，C 在 `goal/checkpoint/` 留一条）
绑定集成 SHA + 验证范围：`diff 只落批准路径` → `受影响插件/模块既有全套 baseline↔candidate 差量 0 新增失败（不只跑新增测试）` → `本组测试命令+实际结果（不弱化公共断言、不削弱既有安全守卫）` →
`跨组契约链路（相关组确认）` → `已知缺陷显式列` → `回退点`。
"机制/夹具证明" ≠ "真实模型证明"（D-0015 分级）。集成前查目标树 dirty；禁对他人的自动 reset/stash（撤 C 自己刚并入的坏提交除外）。P-T1 教训：只跑新增测试漏掉了 D1 削弱 `_secret_attempts` 重放守卫。

**并发安全教训（INC1a，Sol#2 两次实锤）**：端口/注册表/幂等类改动的功能全套与全量差量 **0 新增失败 ≠ 并发安全**——单线程跑不出 TOCTOU（查-改两锁分离、派发与登记/回执跨锁的窗口）。验收此类增量必须含**能证伪的并发钉**：用 barrier / 手工调度锁获取计数 / 阻塞式 fake，把竞态者**确定性地**塞进窗口，证**未修复码红、修复码绿**（压力循环 30×N 若不能强制该窗口=可假绿，不算数）。执行者若自陈某钉「未自然复现、属预防性」，C 须亲跑确定性反例或另证。可执行红-绿复现（C 自跑一次性 pristine worktree 回打旧码→钉转红）是比读码/独立 Sol 更强的证据，可在预算受限时替代追加 Sol（记录替代理由）。

**换线/改端口面 ⇒ 既有测试 fake 扫净 + 执行者必自跑全量（S-block1 二次印证 P-T1）**：把消费点从旧方法切到新方法（如 `.cancel()`→`.cancel_execution()`）时，**全 `tests/` 里所有实现旧方法的 execution/依赖 fake 都要加性补新方法**，否则生产换线后这些既有测试对 fake 调新方法即 `AttributeError`（**非产品回归、非 M-1 破冻，但确是全量新失败**）。执行者自检**必须自带全量 `tests/` baseline↔candidate 差量 0 新增失败**、不得「只跑自门新增/自有钉、把全量留给 C 落」——S t17 只补 `ConfigurablePort` 一枚、漏 wire_v1/subagent_086/141 三处 fake，C 全量门（21F→26F）兜回。C 侧：合批集成后**一律跑全量差量**，撞红即 `reset --hard` 撤回候选、返执行者扫净后重交。
- **第三枚必查交错（INC1a E-017 后补）**：除「双 START」「replay 重派发」外，还须查 **cancel × submit 的 pre-port 半窗**（认领 `port=None` 占位到端口挂上之间到达的 cancel，易被 except 折成 UNKNOWN 却误落账→永久哑化后续可达取消→泄漏不可取消）。通用判据：**回执只为实际发生的下发登记**；临时 UNKNOWN 不得固化为终局。并重申：**验收非终态，post-acceptance fault-attack 仍要续攻**（E 此披即证 C 红-绿也没穷尽所有交错）。


## Sol 使用（仅 C）
调用前核对 `controller/ledger/budget.json` 实际 used 与后端申请；`budget.py consume` 原子预扣（重复 request-id 不再调、失败计次）。
真实审阅命令用已核 help：`codex review -c model=gpt-5.6-sol <--commit|--base|--uncommitted>`，**不猜参数、不偷换模型**；
保留申请、原始结果、退出码、精确版本+里程碑；损坏/不可核验则拒消费并上报。E design-final/impl-accept 各占预留；H 先经 C 审，可不给 Sol 直批。

## 派发下一增量
一个增量验收通过后：更新 `current-state.md` 阶段与契约版本 → 依任务卡提出/批准该组**下一个可验收增量**；
依赖未满足则保留状态、原生唤醒等待，不空转、不自批。全部完成才交 I 做最终验收。

> 集成验证标准（采 P-T2 法）：跑受影响全套 + 根 `tests/`，用**独立 clean clone 跑同一子集、按排序 FAILED-ID 逐字 diff** 证明既有失败非本增量引入；并红-绿可证（回打源码→新钉 FAILED）。

## 验证口径更新（ENV-NOTICE-001，2026-09-21）
系统移除 `/usr/bin/python3.12`、`agent-box/.venv` 坏（→3.14 无 pytest）。旧口径行「`.venv` 21F 同集」不再可直跑。**权威门改锚集成树 `.venv`**：`worktrees/integration-linux/backend/.venv`（3.12.14/pytest 9.1.1），`PYTHONPATH=src:<全部 plugins/*/src>`，`pytest tests/ -q -p no:cacheprovider -rf --tb=line`，FAILED-ID 逐字对 `b067c571` 的 21 条固有失败。
- **不要求任何组为自验重建共享 venv**：坏 `.venv` 者可零写绕行（`~/.local/bin/python3.12`+PYTHONPATH 含 10 插件 src）或**直接 commit+CHECKPOINT 由 C 跑权威门**（S-P9 即此径成功）。
- **插件同名 `test_plugin.py` 跨目录收集陷阱**（P msg.18）：`--import-mode=prepend` 下两枚插件同名 basename → collection 中断假红，**非回归**。跨插件全跑用 `--import-mode=importlib` 或每枚各跑。核心 `tests/` 权威门不含插件 tests，免疫（1434 collected 零错亲验）。产品侧改名 (ii) **本轮不做**（公共测试面、无功能收益），如需另立 P 域清理卡。
- **能力敏感测试＝env-coupled 假红源**：依 capability 矩阵分支的断言（如 `test_harness_sidecar::…ambiguous_semantics` 的 `EXECUTION_FAILED` vs `CAPABILITY_REQUIREMENT_UNSATISFIED`）在组绕行-env 可红、在权威门 env 可绿。**唯一为的＝集成树 `.venv` 的 21F baseline**（`b067c571` 亲测）；绕行-env 红 ∉ 权威门红，**不得据此判回归/改候选**（承 P msg.16「25F exec-venv vs 21F .venv 两套数字勿互讹」）。遇此类疑议：C 在权威 env 单 id 对 baseline↔candidate 双跑定论（§6j 即此法结案）。
- **集成会 dangle 已发布契约的锚点（系统性、已中两次）**：删/移公共代码的增量（如 β1 删 bool `cancel` 壳）会使**先前发布的契约**里的 `file:line` 引用与"全 file:line 指 X"式声明失效（C-RES §12 由 P 查、C-EXEC §1 壳锚由 C 自查）。⇒ **凡动公共面的增量验收时，顺带复查所触文件在既有契约中的锚点**，以**加性子项**（不删原文、带时间戳）标注"此锚＝基线态、现候选已改/删、真值见…"。契约自洽与代码一致同属验收。
- **核心 `tests/` 权威门＝默认 `prepend` 模式、勿加 `--import-mode=importlib`（β2 沙盒自伤）**：给核心全量门误加 importlib ⇒ 6+ 枚测试因**裸名同级导入**（`import test_wire_v1` / `test_delegation`）`ModuleNotFoundError` 中断收集（假信号、非回归）。importlib 只用于**跨插件同名 `test_plugin.py`** 那类目录；核心门用 §ENV-NOTICE-001 recipe（无 importlib）即 1400+ collect 干净。
- **单腿绿 ≠ 全 confluence 绿；S⊗E 合批前 C 必跑「完整合并且同环境 pristine↔combined 逐条 FAILED-ID 差量」预演（β2 实锤）**：S β2 只把 `effective_config_object_digest` 设成 `SessionRecords.create_turn` **必填 kwarg**，其自身 4 钉（走 fake RecordingPort）全绿——但一枚**既有表征测试** `test_stage_a_server.py::test_restart_seals...` 走底层裸 `ProductRepositoryView` 路、合到候选后（有 `CancelOutcome` 才第一次可 collect；S 单树 import 即断、根本测不到）`TypeError missing kwarg` 转红。⇒ 全量门多且仅多 1 枚（22F vs pristine 21F）。**教训**：动共享签名/公共面（尤其把参数设必填）的增量，(a) 其回归可能只在**完整多腿合并**且**依赖补齐后**才浮现，单腿/单树自测必漏；(b) 验收 confluence 须以**完整合并树的全量门**为准，且用**同环境 pristine 对照**消除 env 漂移（本会话 `21F` pristine 复现即证环境一致、差量可信）。C 上一轮据"单腿 4 钉绿"就发"仅差 commit"＝证据不足下结论过早，已更正。
- **跨域引证公共口径（P reports/34 §3，C 采纳 01:31Z，对四组与 C 生效）**：凡引用**非本组写清单内文件**的 `file:line` 证据，须 (a) 指向**候选树**（当前集成 HEAD，非本组树）且 (b) **声明 blob-id**（40 位）锚定观测对象。理由：组树与候选行号可差（P r32 实测 ±1/±20/±34），blob-id 法把漂移伤害限于行号、不污染语义断言；验收/契约件按「行号重述、blob 全等＝断言仍真」核。C 自身契约锚纪律（加性更正+时间戳）同源并存。
- **差量门＝同形树对比（S-DM1 教训，C 采纳 03:39Z 起全队口径）**：baseline↔candidate 两侧必须**同种树形**（真 worktree↔真 worktree，或同法 archive↔archive）——git-archive 展开树与真 worktree 在 git 依赖测试面 collection 读数不可比（20E↔0E 假象，S 首跑踩坑自纠）。E sim 用 `git clone --no-hardlinks` 亦须与对照侧同法。
- **收件扫描＝top-N 清单比对，勿用「新于阈值」**（P msg.40 正当批评，04:33 认账）：窗口过滤在连续空转后会把落在缝隙里的消息漏掉（msg.37-39 三件 03:58-04:1x 落盘、04:14/04:19/04:26 三次筛过均未命中）。改为每周期 `ls -t <组>/outbox | head -4` 与板上「已处理至 msg.X」水位比对；水位记入板 P/S/E/H 行。
- **停滞判定前必查全分支与 outbox 水位**（S msg.40 回销教训，04:37）：主树 clean＋`.qoder` 静默可能是**纪律性冻结**（实现在 side branch）——误报一次。判据补：`git log --all`、分支表、最近 outbox/报告 mtime 齐看再报。
- **单腿 confluence 假象的见证法（E-054 范本，05:01 采为口径）**：单腿红差须以**分形见证**归因——A（模拟对腿最小步）＋B（A＋批前回落）两轮把全红拆到 100% 归属对腿/历史形状，附计时观察（22.6min＝60s deadline 等满属假象副作用）；红因逐枚与设计同构枚举。合批门只认合批树。
- **写入权移交两要素制（I 立规 05:42，即日生效）**：撤销/转交某路径写权前，必收**原写入者**「已停写＋最后提交/差量」回执；**超时无回应≠已停止**（05:16 (c) 代交令基于静默＝违例样本，虽无害规则收紧）；确需接管走 V2 §3 **独立树方案**（快照摘要一致、原树保留、回归重 ACK），禁共享树原地双写。竞态处置范本＝`decisions/a3-proxy-race-ruling.md`（采纳既有成品、取消重复实施、残余差量单列、命名差异不重写）。
