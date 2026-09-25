# CP-H-KILO · kilo Agent 接入包等价抽离集成验收

C（GLM5.3 恢复轮）· 2026-09-22 14:0xZ · backend `integration/linux-native-0`
**`0c042f5499d1f8ebc843327f730bc529be065a14`**（父 `fe59016b`，**快进**＝H 源提交
`649938b1` 的 cherry-pick 同内容；工作树 clean；未 push/main）。H 任务树
`work/be-kilo-1`（`harness/work/kilo`）交付 `649938b1` 原样保留，原 `7a1b2699` 树
零触碰。依据：`approvals/H-KILO-001-release.md`（10 路径）；H 侧 `goal-H-042`
（HANDOFF_READY＋停写回执，八项硬验收全读数）。

## 内容与边界

- kilo 家三模块字节平移至新 `plugins/agent-box-harness-kilo/`（含 deploy/kilo 两资产：
  `kilo.json`、`egress-guard.c` 哈希对逐字节）；恰两处申报改码（`:37` 家→核心直指、
  `:71 PLUGIN_ROOT=parents[2]`）；旧 `agent_box_harnesses/kilo` 三文件＝预注册式同对象
  别名（零第二实现）；`__init__` 急切原样；零 EP；`tests/test_family_dialect_tables.py`
  +3 钉。路径面 C 已核＝批文 10 路径（+568/−319）、零越界、树 clean。
- 明确不动项逐条遵守：三份旧 deploy 资产零删除（处置按
  `decisions/H-old-assets-disposal-ruling.md`）；`harnesses.toml`/两 EP/聚合器/
  `test_kilo_production_template.py`/093/runtime/third_party 零改动。

## 串行验收（同环境，C 唯一队列）

- **根门**（与 CP-E-E2a/CP-S-S2a 完全同环境）：`fe59016b` 基线 20F/1447P/33S/0E vs
  本批 **20F/1447P/33S/0E**——**FAILED/ERROR ID 逐字一致，零新增、零转绿**（kilo 改
  动全在 plugins/，根门面不变；+0P 合理：3 新钉在插件树测试内）。日志
  `/tmp/kilo-glm-root.log`（sha256 `e43731dc…`）；摘录
  `baseline/evidence/kilo-root-red-ids.txt`。
- **插件面**（C 独立复跑，配方＝PA1/qwen 同款 ignore 两件）：**7F/154P/3S**，FAILED ID
  ＝hermes×6＋skill_projection×1，与 H 交付 `checkpoint-kilo/failed-ids-kilo.txt`
  **规范化后集合同一**，亦与 qwen 基线 `failed-ids-qwen-baseline.txt` 同集。日志
  `/tmp/kilo-glm-plugin.log`（sha256 `40c6a351…`）；摘录
  `baseline/evidence/kilo-plugin-red-ids.txt`。
- **093 两锚**（C 复跑）：`test_native_materialization_093{,_stage3}.py` **32P 零改**。
- 既有环境红（根门 20F、插件面 7F、dsh/capability 两件 PyYAML collection error）原样
  单列，**不宣称全绿**。

kilo 第三格闭合（dsh→qwen→kilo 三家已按同构模式落地）。H 转 IDLE；下一批任务已发
inbox：两枚 loopback-guard 微批＋下一家 pi 先报。
