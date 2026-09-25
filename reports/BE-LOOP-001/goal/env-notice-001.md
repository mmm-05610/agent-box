# ENV-NOTICE-001 — 本轮验证统一口径（系统 python3.12 移除后）

发出：C · 2026-09-21 20:54Z · 适用 S/E/H/P 全组 · 性质：验证口径裁定（C 权限内，非扩权、非产品取舍）

## 事件
系统移除了 `/usr/bin/python3.12`、`/usr/bin/python3` 升到 3.14.4。`agent-box/.venv`（2026-06-19 建的符号链接）因此指向 3.14，`lib/python3.12/site-packages` 不再加载 → `python -m pytest` 报 `No module named pytest`。这把 rubric 旧口径行「`.venv` 21F 同集差量」变得不可直接执行。**这是环境事实，非任何组的产品回归。** 承 P msg.16/17/18。

## 统一口径（三条，全组照此）

**(1) C 侧权威门 = 集成树 `.venv`（未受影响，即 baseline 环境之的）。**
- 解释器：`worktrees/integration-linux/backend/.venv/bin/python`（Python 3.12.14 / pytest 9.1.1）。
- 调用：`PYTHONPATH=src:<所有 plugins/*/src> .venv/bin/python -m pytest tests/ -q -p no:cacheprovider -rf --tb=line`。
- 全量 `tests/` 差量对 baseline `b067c571` 的 21 条固有失败（pi_gate_cleanup、sidecar_lease_keepalive、child_limits 缺 Rust worker、opencode/claude/wsl 缺工具）——FAILED-ID 集须逐字节相同。集成候选、放行判定**只认这条**。

**(2) 各组自验：`.venv` 坏了不必重建，二选一。**
- (a) 零写绕行（P 已实测）：`/home/maoqh/.local/bin/python3.12`（3.12.14，uv 提供）+ 把 site-packages 前置进 `PYTHONPATH`，**必须含全部 10 枚 `plugins/*/src`**；或
- (b) 直接 commit + 交 CHECKPOINT，由 C 跑 (1) 的权威门。**本轮不要求任何组为自验重建共享 venv**（重建爆炸半径大、非本轮授权）。S 对 S-P9 就是走 (b) 成功的。

**(3) 插件同名 `test_plugin.py` 收集陷阱（P msg.18 补-2）。**
跨插件一条命令收集会在 `--import-mode=prepend` 下因两枚插件同名 `test_plugin.py`、目录无 `__init__.py` 而 **collection 中断假红**（非回归）。凡「跨插件全跑」：`--import-mode=importlib` 或每枚插件目录各跑一次。
- **对本轮核心 `tests/` 权威门无影响**（`tests/` 不含 `plugins/*/tests`，1434 collected 已亲验零收集错）。此陷阱只影响把插件测试并进的自跑合计。

## 对 P msg.18 两项处置的裁定
- **采 (i) 口径侧规避**（已并入上文第 3 条，零改动，即时生效）。
- **(ii) 产品侧治本（给插件测试唯一 basename / 放包标记）本轮不做**：它改**公共测试面命名**、触及所有组的收集行为、且无功能收益，不宜在 INC 流程中途开这个口。若日后要做，属 **P 域清理增量**、单独立卡批量处理，不塞进 INC1。⇒ **P 维持 `IDLE_AWAITING_DISPATCH`，不因此开新面。** Sol 0 未用、P-T5 依裁暂缓 结论不变。

## 一句话给正在等门的组
不用管 venv 通不通——把该交的 commit + CHECKPOINT 交上来，权威门 C 亲跑。
