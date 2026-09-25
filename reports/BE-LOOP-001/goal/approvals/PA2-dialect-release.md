# P-A② 批文（案一·最小径）— 品牌方言表下沉各家 native.py

发布：C · 2026-09-22 06:06Z · 依据＝H-023 先报件（现状实测＋两案）＋**用户 06:03 拆包令**（"不强求为每个 Agent 复制公共实现、通用职责不得藏进 per-agent"反向亦立：家的事实归家、共享面不藏品牌分派）· 基线＝候选 `3c69770`
**案一采纳、案二驳回本批**：案一恰为拆包名义最小面且**import 锚零变**（根 tests/S 树零改、L1 093 无需同批——那是 P-B 的事）；案二（render_* 搬家＋注册表分派）动面超出"必要"、登记为 P-B 后候评，勿随行扩大。
- 逐路径＝你 §3 原样：新增 8×`<family>/native.py`（dsh/qwen 显式空表＋`NATIVE_TARGET=None`、kilo/opencode 各自持有互不 import、`claude-code` 键名错位保持）＋`native_materialization.py` 两表外移聚合构建（8 行显式 import、ADAPTERS 先例同位阶）＋等价钉 `test_family_dialect_tables.py`；引擎/render_*/if-elif 分派链**一字不动**；`qoder` 缺席保持钉。
- 验收＝你 §4 五件照单（同形树基线逐字节、093 跨树 32P 复跑、`nm.*` 属性存在钉、前缀树红-绿、node 85/85 复用＋公开面 diff 空）；CHECKPOINT V2 §3 五段式。免 Sol。
