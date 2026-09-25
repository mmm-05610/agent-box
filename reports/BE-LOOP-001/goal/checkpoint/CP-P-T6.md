# CP-P-T6 — P-T6(缺口 B) skills `disable` 重放泄漏修复 验收

> **✅ 验收通过（22:09Z）：入候选 `67e5c52`**（`f97e96f` ⊕ P `a5e230a`）。**免 Sol**（批文明免、C 红-绿自证）。承 `approvals/P-T6-skills-disable-leakfix-approved.md`（仅批缺口 B）。

## 内容（缺口 B only）
`disable` 的 `mkdtemp→copytree→os.replace` 段套 `try/except Exception: shutil.rmtree(tmp, ignore_errors=True); raise`，与同文件 `import_directory:213-219` 逐字同构 → 陈旧令牌重放**不再泄漏无主孤儿 tmp 目录**（R-4）。**缺口 A**（陈旧令牌→`REVISION_CONFLICT` 早退）**依裁未做**、延 R-6/INC2 ⇒ 失败仍为**同一 `OSError` Errno 39**（零对外语义变化）。范围＝`store.py` disable 方法体（+7/-1）+ `test_skill_store.py` 仅追加（+24）；签名未动、未加删除/清理动词、未扫历史孤儿（R-1，越白名单者 `_write_index` 固定名自愈仅登记）。

## C 独立门
- **skills 插件套件（C 亲跑候选）**：**10 passed / 0 failed**（8→10，P 自报口径一致）。
- **红-绿双向**：P 在独立 clean clone（pristine `disable`）实测 修前 1 failed/8 passed（残留 `.2.<hex>` 孤儿）、修后 10 passed；C 另独立确认零既有测试依赖旧泄漏行为（`:55` 用 latest 令牌、不经碰撞路径）。
- **根 `tests/` 旁证**：候选 21F/1388P/1xf、FAILED-ID 逐字节同 baseline → **0 新增**（store.py 变更不触 root 测试面）。
- **P 5-call repro**（C 采其表）：修前 4 次陈旧重放→**4 枚孤儿**、修后→**0**；rev2 未被覆写、`_latest` 不受污（`:156 isdigit` 过滤）；异常类型恒 `OSError` ⇒ 「零对外语义变化」由推断升实测。

## 落地后契约加性
`C-RES@v1` §4 第三档 skills-disable：R-4 **泄漏已止（B 落地）**、但 **R-3「干净重放拒绝」仍待缺口 A/INC2** ⇒ 维持「部分达成」不谎称全绿；§10 桩 D 拆 D-B(done)／A→归 R-6。以加性节记录（见 `contracts/C-RES-v1.md` 更新注）。

## 后续
P 余 `IDLE_AWAITING_DISPATCH`：D4/D5→IFR-01、D17→契约、INC2 两征询、ssh、windows `cleanup->bool` 归属、缺口 A→R-6/INC2。P 累计 Sol 0、未 push。
