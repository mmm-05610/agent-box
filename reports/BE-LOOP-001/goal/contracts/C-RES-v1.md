# C-RES@v1 — 资源插件契约（租约 / 部分失败 / 重复释放 / 归属 / 落盘回收责任 / 不得静默退化）

**发布**：C 固定版本 · 2026-09-21 21:36Z · 内容提供方 **P**（`agent-box-git`/`skills`/`artifacts`/`terminal-session`），版本固定与发布归 C（同 `C-EXEC`/`C-RUNTIME` 法）。
**消费方**：**E**（资源解析/准备/释放链）、**H**（增量 3 文件·终端委托）。
**基线** `b067c571`；**实现锚** `2fa8b5a` = 候选 `b15c435` 同一实现（`file:line` 指此；唯 `disable` 相关行改指 `67e5c52`、余六枚被引文件 blob 全等，详 §12 注）。内容源：`platform/reports/22`（全研究）+ `23`（可发子集定稿）；C 裁 `decisions/`（X18-half-split §5、C-RES 处置见 `C-notice-P-022`）。
**版本性质**：**可发子集**＝现状正证 + C 已裁语义（R-1..R-5/R-7/R-8/R-9），**零代码**。R-6 与留存/D4/D5/D17 及一处现行偏差以 **§10 可见 pending-appendix 桩**随文发布（**不删除、不假装通过**）。与 `C-RUNTIME@v1` §2 **不重叠**（§2 钉回执键集，本契约钉可观察性/所有权语义）。

## 1. 输入 / 输出（四插件动词互异、不假装同构；只钉"谁必须有什么读法"）
- **git**：`make_ref(selector)`→`Ref(WORKSPACE,…,{tree})`；`resolve(contract_id,ref,*,context)`（须带 `context.execution_id`）→`WorkspaceV1`；`capture(*,execution_id,workspace,frozen_ref)`→`(Ref,())`，**无变更即拒** `NO_WORKSPACE_CHANGES`；`cleanup(execution_id)`→**清理族** `{status: cleaned|already_cleaned|{error:固定词}}`（`provider.py:37/42,52/90-107/116-146`）。
- **terminal-session**：`allocate()`→`TerminalAllocation`（**仅租约记录**）；`run(host_transport,spec,attempt_key)`→`TerminalRunHandle`；`observe(scope=None)`/`attach()`→读数/`AttachDescriptor` **或 `None`**；`release(request=None)`→**三态族** `{released,destroyed,managed}`（`direct_stdio.py:50-87`、`tmux.py:196-212`）。
- **skills**：`import_directory(source,*,expected_revision,provenance)`→`AgentSkillV1`（不可变 revision）；`get/list/ref/resolve`（disabled **按不存在**＝`KeyError`）；`disable(skill_id,expected_revision)`→追加 `disabled=True` **新 revision（墓碑）、从不删文件**（`store.py:202-262/248-256`）。
- **artifacts**：`descriptor/make_ref/resolve` + `prepare/bind_registry`（`provider.py:31,34,40`、`selector.py:21,24`）。

**语义钉法**：`resolve` 必为**幂等读**（同 ref 多次解析不改 host 事实）；凡向 host 写文件者（git `resolve` 物化、skills `import_directory`/`disable`、artifacts `prepare`）统称**落盘动词**，受 §5/§6/§8 约束。

## 2. 状态权威（同一事实只有一个权威层，余为投影）
| 事实 | 唯一权威层 | 投影（非权威） | 证据 |
| --- | --- | --- | --- |
| 谁拥有此工作树 | git marker `managed_root/.ownership/<scope>.json` 三元组 `{execution_id,commit,tree}` | 目录存在与否 | `provider.py:55,58,67-69` |
| 本次租约是否存在 | terminal provider `_allocation` | `observe().unit_alive` | `direct_stdio.py:50-54,72-77` |
| 会话是否被本 provider 销毁 | 三态族 `destroyed` + provider `has-session` 探针 | 调用方计数 | `tmux.py:196-212` |
| skill 是否可用 | 磁盘最新 revision `disabled` 标记（读时过滤） | 内存索引 | `store.py:232-248` |
| attempt 是否已下发 | provider `AttemptLedger`（键 `attempt_key`） | 调用方重放请求 | `common.py:33-42` |

> **R-1（规范）**：**只有存在所有权记录的删除动作才可执行**；「资源在但归属不明」**必须是拒绝、不得当可清理**。git 现状即此（无 marker 而树仍在→`refusing to clean unowned worktree` `:129`；复用须 marker 与身份三元组**全等** `:58`）。skills 的对应形态＝**根本不提供删除动词**（见 §8/R-9）。
> **R-9（规范，P 定稿新增）**：**墓碑不得伪装成删除。** 以追加禁用态表达回收者（skills `disable`）在契约上记为**留存仍在增长**，消费者不得据其返回值推断 host 释放了任何空间（`store.py:248-256` 全路径仅 `mkdtemp`+`copytree`+`os.replace`、失败仅 `rmtree` 本次自建 tmp、**无 `unlink`**、无 revision 字节释放）。

## 3. 准备 ≠ 发动（可分离性）
> **R-2**：`allocate()` 级动作**必须**只产租约记录、**不得**触 transport ⇒ **不可能**创建目标进程；发动是另一动词。`run()` 无分配时**必须**拒（现状 `RuntimeError("allocate must precede run")` `direct_stdio.py:57-58`）。git 对应＝**marker 先于 worktree**（`:63-69`）。收益：消费者"占位失败"路径不需写进程回收、准备阶段可安全重放。

## 4. 重放安全
> **R-3**：同一 `attempt_key` 重复下发**必须返回原判、不得二次触原生面**。现状**按实记账、不拔高**：
- **达成**：terminal-session direct-stdio（`AttemptLedger.prior` 命中即返回既有 handle `direct_stdio.py:59-61`；下发前 `_validate_attempt` 不符即 `CompositionRejected(SPAWN_TOKEN_INVALID)` `common.py:28-30`）。
- **部分达成**：git `resolve`（重放要求 marker 全等否则拒 `:58`）＝"拒绝式"而非"返回原判式"。
- **未达成（已知偏差、本版本不背书）**：**skills `disable` 不接受重放**——陈旧 `expected_revision` 被接受后撞已有 revision、抛**未类型化** `OSError[ENOTEMPTY]` 且**每次泄漏一个孤儿临时目录**（5 重放→5 孤儿）。系 §5 R-4 现行反例，证据/复现 `platform/reports/24-skills-disable-replay-leak.md`；修复见 §10 桩 D（**待 C 逐路径批**）。
  - **〔加性更新 22:09Z · `CP-P-T6`〕**：**R-4 侧泄漏已止**（P-T6 缺口 B：`disable` tmp 写段套 `try/except→rmtree(本次自建 tmp)`、与 `import_directory` 同构、孤儿 4→0、同一 `OSError` ⇒ 零对外语义变化）。**R-3 侧「干净重放拒绝」（陈旧令牌→`REVISION_CONFLICT` 早退）＝缺口 A、仍待 R-6/INC2** ⇒ skills `disable` 重放安全**维持「部分达成」不谎称全绿**；§10 桩 D 拆 **D-B(done)**／A→归 R-6 桩。
  - **〔加性更新 04:44Z · `CP-INC2-B1`·候选 `16623db`〕缺口 A 已落**：skills `disable` 陈旧令牌改同 token **typed `REVISION_CONFLICT` 早退**（与 import_directory 同构、P d927c61、C 门 0 新增）⇒ R-3 对 skills 面**升为达成**——**按 P r41 自纠注级别＝『调用面零生产触达、修的是休眠形状债』**，非线上危害已堵之谓；§10 桩 A 的 disable 枚随之闭合、R-6 余 git 14 抛点等项。

## 5. 部分失败与补偿方向
> **R-4**：**补偿必须把系统留在「可被后续清理识别」的一侧**；`ignore_errors` **只允许**作用于本次自己刚建的临时目录、不得用于任何可能有他人在途资源的对象。正证：git 先 marker 后 worktree、失败先删树且**仅当树确消失且 marker 仍是自己身份**才删 marker（`provider.py:63-87`，注释点明反序造永久孤儿）；`cleanup` 同序（先 `worktree remove` 后 `marker.unlink` `:130-146`）。skills `import_directory` tmp 回滚合规（`store.py:211-221`）——**但 `disable` 无此回滚＝R-4 反例（§4 第三档）**。**〔加性更正 22:22Z · `CP-P-T6`〕**：上句「`disable` 无此回滚」**自 P-T6(B) 起不再成立**——`disable` 现有与 `import_directory` 逐字同构的补偿（`store.py:252-255`、rmtree 宾语限定＝本次自建 tmp、不释放任何 revision 字节）⇒ **R-4 在 skills 面转正**；R-3 侧仍受缺口 A 限制（见 §4 加性子项），不因此升格。

> **R-5（C 裁=(c)，落文）**：
- 三态族 `release` 语义＝**"我的 claim 已解除"**，**不**承诺报告"是否实际做了清理"；`released` 恒真**不构成**"做了事"的证明。
- **"重复调用是否可分辨"只由清理族承诺**（`cleaned`/`already_cleaned`）；managed 面另以 `destroyed` 位承载"有无真销毁"。
- **明文承认不可证面**：direct-stdio `release` 首次与重复**逐字相同**（`direct_stdio.py:82-87`）；借用侧（`managed=False`）本就不得销毁他人会话（`tmux.py:212`）。需分辨幂等**必须走清理动词**。
- **推论（规范）**：消费者**不得**以"重复 release 返回不同"作收敛检测；收敛检测权威＝§2 所有权记录本身。

## 6. 失败/重试/拒绝必须可分（含"不得静默退化"）
> **R-7**：
- **"能力不可用"必须显式读数、不得退化为另一条无隔离/无凭据保护通路**（catalog 原文之锚）。正证：无 durable attach→`attach()` 返回 `None` 而非编造 descriptor（`direct_stdio.py:79-80`；tmux 同形）。
- **确定拒绝/确定完成/未知不得混淆**：超时与未知不得用重试掩盖成确定完成（direct-stdio 以 `attempt_key` 台账把重放折回原判，§4）。
- **回执/日志不得回声调用方可控原文**（D14）：`observe` 不回显 `scope`（`direct_stdio.py:72-77`）；git `cleanup` 失败回**固定词**非 `str(exc)`（异常含调用方可控 `execution_id`，`provider.py:137-141` 注释自陈）。
- **秘密/argv 卫生（正证）**：argv 经 provider 自有 `O_WRONLY|O_CREAT|O_EXCL` **0600** 文件传（目录 0700、`secrets.token_hex` 随机名、失败即 unlink 后重抛 `common.py:61-74`）；tmux legacy command 字段**只放固定 provider 自有可执行名**、token 路径走环境槽、**永不插进 command**（`common.py:77-82`）。落盘权限：skills 目录 0700/文件 0600 并显式 `os.chmod`（`store.py:211-217`）。

## 7. 兼容影响
- **零代码**：§1–§6 全为现状正证 + 已裁语义，子集发布不要求任何 provider 改签名/回执键集/公开 Wire。
- **与 `C-RUNTIME@v1` §2 不冲突**：R-5=(c) 是对 §2 键集的**语义解释**、非新增键；曾考虑的加性 `already_released` 键**被裁废弃**（(b) 会诱导 provider 造第二套簿记、与"不铸第二套壳"纪律相斥）。
- **演进约束（规范）**：后续改动**只可加性**（新章节/桩落成）或下一主版本；在途任务固定引用 `C-RES@v1` 不受影响。
- **给 E/H 的一句读法**：见三态族只问"claim 解了没"、见清理族才问"做了还是本就 done"；需"归属"时读记录、不读目录存在性。

## 8. R-8「落盘即须声明回收责任方」（C 已裁纳入）
> **规范**：凡向 host 写文件的资源插件**必须**在契约中显式写明「由谁、在何事件后回收」，或显式声明「本产品面不提供回收」。**沉默不允许。**

| 面 | 落盘 | 回收责任方 | 现状态 |
| --- | --- | --- | --- |
| git `resolve`/`capture` | worktree + marker | 本插件 `cleanup`（清理族） | 已声明、已实现 |
| terminal-session `run` | 目标进程 / tmux 会话 | 本插件 `release`（managed 销毁；借用面**只解 claim 不销毁**） | 已声明、已实现 |
| skills `import_directory`/`disable` | revision 目录（不可变、墓碑式追加） | **无**（无删除动词；`disable` 只增不减，R-9） | **显式声明不提供回收**（本次首记） |
| artifacts `prepare` | `root.mkdir`+`path.write_text` | **无**（公开面全量枚举后确认无 release/cleanup/discard） | **显式声明不提供回收**（本次首记） |

**边界**：R-8 只强制**该事实被记录**、**不**预判保留期政策。留存期/明文 home 留存＝**IFR-01，交 I**（D4/D5 待裁）。补真正的 release 动词会新增对外可见语义（触公共区与 E/H 消费面），不属 P 可自推。

## 9. 反例（缺失即出什么事；见各 §）
缺 R-1→一把 `rm -rf` 扫掉他人在途工作树/跨执行互毁；缺 R-2→占位失败留活进程、消费者被迫写进程回收；缺 R-3→重试把一次 spawn 变两次（重复扣费/副作用）；缺 R-4→半建工作树成永久孤儿且挡重解析；缺 R-5→消费者从 `released:True` 反推"我清了"、幂等检测建于不可证读数；缺 R-7→能力缺失时**悄悄换无隔离通道**跑（catalog 所禁）；缺 R-8→artifacts/skills **写了无人认领回收**、留存问题契约层不可见、IFR-01 无据可裁；缺 R-9→调用方以为 `disable` 释放内容、实为磁盘单调增长。

## 10. 显式 pending-appendix 桩（本版本**不含**，发布时可见）
| 桩 | 内容 | 归属 / 门 |
| --- | --- | --- |
| **A: R-6** 拒绝词汇收敛 | 过组合缝者抛 `CompositionRejected(CompositionErrorCode.*)`；git provider **14/14 处裸 `ValueError`+散文**（已复核精确）；`disable` 撞车处裸 `OSError` | **延 INC2**（改公共可见行为、很可能触 E 单写者 `sandbox_port.py`；P 只登记不自修） |
| **B: 留存 / D4 / D5** | home 与明文留存期政策 | **IFR-01 交 I**，裁定后作追加节 |
| **C: D17 scope 归一** | `execution_id→scope` 清洗 `isalnum() or in "-_"` 否则 `_`（`provider.py:53,91,117`）；`str.isalnum()` **Unicode 感知**⇒全角/同形可通过、`/`与空格折 `_`⇒`E/1`、`E_1`、`E 1` **归一到同 scope** | 合法域问题、**C 已挂契约/I 分流**；只登记事实、不固化、P 不自修 |
| **D: skills `disable` 修复** | §4 第三档 / §9 末行（陈旧令牌被接受→未类型化 `OSError`+每次泄漏孤儿目录，5→5 实测〔**P-T6(B) 后＝4→0**，见 `reports/25`〕） | **〔22:28Z〕缺口 B 已批(21:41)·已验收(`CP-P-T6`，入 `67e5c52`)＝D-B done**；缺口 A（typed `REVISION_CONFLICT` 早退）→归 **R-6 桩/INC2**（见桩 A） |
| **E: windows 归属** | `sandbox-windows` 2 处引用 + `cleanup->bool` 形状 | 见 msg.platform.20，与本契约正交 |

## 11. 发布与次序
1. **`C-RES@v1` 已固定发布**（内容＝§1–§9 + §10 桩随文、桩须可见）。
2. 消费基线：E 资源链读法（§7 末句）；**H 增量 3 不以本子集为解锁条件**（其锁在 D5/IFR-01）。
3. 既有门不变：`C-RUNTIME@v1` §2 键集、E-015 征询（INC2）、P-T5 暂缓。
4. 桩 A/B/C/D/E 任一落定 ⇒ **加性节并入、不发新主版本、不影响在途引用**。

## 12. 证据可复现性
全 `file:line` 指 `2fa8b5a`（=候选 `b15c435` 同一实现）〔**加性更正 22:29Z · P-T6(B)**：唯 `store.py` 的 `disable` 相关行（`:248-256`/`:252-255`/`:255`）改指 `a5e230a`＝候选 `67e5c52`；其余六枚被引文件在 `2fa8b5a`→`67e5c52` 间 **blob 全等**（P reports/29 穷尽审计），其行号一律仍有效〕。§1 skills/artifacts 行**不靠词汇 grep**：由全量 `def/class` 枚举证成（artifacts 全部 def 仅 `descriptor/make_ref/resolve/_sha256/_file_uri_path/prepare/bind_registry`+注册三件；skills `rmtree|unlink|shutil.` 全库仅 `store.py:219`（其自建 tmp 回滚）与 `:251`（`copytree` 构造）、**无删除路径**〔加性更正 22:22Z · P-T6(B)〕：现三枚删除/构造调用 `:219` rmtree（import 回滚）／`:253` copytree／`:255` rmtree（disable 回滚，P-T6 新增）；`unlink`/`os.remove`/`rmdir` **仍 0 命中** ⇒ 「无任何 revision 释放路径」＝R-9 之据**不变**）。草案内不含秘密值、不含他组可写路径、不主张真机行为。
