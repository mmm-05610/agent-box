# CP-E-INC1a — E 执行组 INC1a 集成检查点（C 独立核验 + Sol#2 实施验收）

> **✅ 验收通过（19:47Z）：自洽集成入候选 `a86ca66`。** 终态：`d35b5d6`(源)+`bf21839`(并发修复)+`400577a`(回归钉入 `tests/server/`)。**C 可执行红-绿复现**（钉 pristine `d35b5d6`→2 红、修复树→28 绿，证非假绿）+ round-2 Sol「两修复正确、不变量全在」+ S 独立三核 + **自洽全量 `tests/` 21F/1377P/33skip/1xfail、FAILED 与 baseline 逐字节同→0 新增失败、~50 in-tree 钉全绿、INC1b/1c 严格 xfail 正常**。**免第 3 次 Sol**（详见 `sol/E-impl-accept-002-decision.md` 追补节）。**→ 已放行 S-block1。**
>
> （历史：首版 `ee39270` Sol round-1 REJECT 两处并发 races → E 修 `bf21839`；round-2 `a4f7ca4` 码正确但钉未入仓 REJECT → E `400577a` 入仓；下述为核验记录。）
>
> **post-acceptance 补（E-017，20:13Z）**：E 续攻发现**第三枚并发漏**（cancel × submit pre-port 半窗 → UNKNOWN 误落账 → run 不可取消泄漏），**C 对集成候选 `ac28ad5` 亲跑复现属实**（非回归；bf21839 未关此邻窗）。裁定 `decisions/INC1a-residual-cancel-leak.md`：采修复 (i)（回执只登记实际下发）**随 S-block1 合流批 E 腿（P8）前置落地**，不撤 INC1a（核心/两窗/49 钉有效、该端口尚未被 S 消费）。教训入 rubric（三枚交错 + 验收非终态）。



更新：2026-09-22 18:58Z（C）。依据 `approvals/E-INC1a.md`（批准 a-1..a-4+a-6，案B）。真实证据，非 fake。

## 候选推进
- 前候选 `4917f56`（b067c571⊕P-T1⊕P-T2）→ cherry-pick E 组 `d35b5d6`（INC1a）→ **新候选 `ee39270`**（+ INC1a）。**无冲突**（INC1a 落 `src/agent_box/server/execution/**`，P 落四插件域，路径不相交）。集成前查 integration 树 clean。

## C 独立核验（不采信 E 自报，逐条亲跑/亲读）
- **范围**：`git show d35b5d6 --name-status` = **仅 4 文件** `execution/{__init__,execution_contract(new),sidecar,sidecar_backend}.py`，全落批准 §12 白名单内；批准 §14「不得触碰」清单（`protocols.py`/`extensions/api.py`/`runtime_composition/**`/`bootstrap/**`/`work_core/**`/公开 Wire/REST）**零命中**。`__init__.py` 为纯加性：新增 3 个 Protocol 抽象方法 + re-export 契约类型，bool `cancel` 原样（docstring 自陈壳待单独批准的增量删）。
- **E 组套**（C 亲跑，exec venv）：`../tests/` → **49 passed / 1 xfailed / 0 failed**（唯一 xfail=INC1c 归属 no-product-domain-imports 钉）。
- **S 永久公开形状锁**（C 亲跑，对 E INC1a src）：`test_block1_cancel_public_shape_s.py` + `tristate_consumption_s.py` → **7 passed / 3 xfailed**，其中 **4/4 公开形状锁仍绿**（3 xfail=S 切换绊线，S 未批切换，诚实）。
- **全仓回归**（C 亲跑，integration `.venv`，与 baseline 同环境）：`tests/` 全量 → **21 failed / 1328 passed / 33 skipped**，FAILED-ID 集与 baseline `b067c571` **逐字节相同 → INC1a 入候选 = 全量 0 新增失败**。
- **C 亲读语义**（判 Sol 用，非代劳）：`cancel_execution` 回执登记先于目标查找、replay 返回原回执永不二下发、timeout/丢失应答折 `UNKNOWN` 不漏异常、bool `cancel` 仅 `CONFIRMED_STOPPED` 真（D2 折叠，契约一致的临时壳）；`observe_execution` 纯读零下发零写账；`submit` 无 Core 铸造、replay 返回原 receipt。未见守卫削弱。

## Sol#2（E impl-accept 预留，gpt-5.6-sol 真实调用）
- 预扣：`budget.py consume --group E --milestone E-impl-accept --request-id c71fcc4f-62bd-4d5a-9337-8d17326e584f` → **GRANTED**，used **3/10**。
- 审阅：`codex exec -C <ee39270> -c model=gpt-5.6-sol -s read-only --skip-git-repo-check`，raw → `sol/E-impl-accept-001.raw`。**结论待回填**（ACCEPT→record ok + 放行 S-block1/INC1b；REJECT(blocks:impl)→record + 撤回候选 `ee39270`、返 E，Sol 失败仍计次）。

## 已知缺口（E 交、C 认，非本批静默项）
- 真 sidecar 工厂仍消费 legacy context；neutral context 形状待 IFR-04/C-HARNESS bundle 声明后 H 对齐（机制≠真机）。
- S 交接：S 夹具 `cancel_outcome(execution_id)->str` 应改 `cancel_execution(execution_key)->CancelOutcome`；S-block1 落地后其 3 例 strict-xfail 转绿、壳删除（案B）随 `1a→Sblk1→1b→1c`。
- **集成副作用**：INC1a 给 `sidecar_backend.py` 增 +180/−11 → **S 原按 `4917f56` 锚的 `:1020` 等行号在本文件内漂移**，S 提 block1/R1 逐路径申请时须对**新候选 `ee39270`** 重锚（C 将随放行通知点名）。
