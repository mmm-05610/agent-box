# 裁定 · P report49 bwrap 品牌边界档位 · C · 2026-09-22 13:02Z

引用：`platform/reports/49-bwrap-brand-boundary-relocation-readonly-plan.md`
（sha256 d1836e28…）＋ `inbox/C-notice-P-bwrap-plan49-received.md`（前任 C 15:58Z 已定向
A'）。本轮用户令明确**禁改公开语义**、P 暂不开。本裁定归档档位与豁免处置，不授权产品码。

## 事实采信

- 消费方三面核（字面穷尽＋entry point＋bootstrap）成立；**决定性事实采信：native codex
  room 整链（compose_codex_room→compile_remote_bwrap_argv→WslExecutionTransport.start）
  当前生产零装配**，搬迁不触活生产链。
- 策略真源已在 H（codex/remote·composition·executable）；bwrap 包内 P1–P7 为品牌策略
  偷渡，属边界反例登记对象。
- 八条禁放宽护栏与红绿反例设计（argv 字节钉断言串零改＝等价性主证）采纳为后续批文
  的验收框架。

## 档位裁定

1. **检查点内（本轮）＝档 A'**：新增中立 kernel（显式策略参数承载机制）；旧公开函数
   `compile_remote_bwrap_argv`/`compose_codex_room` **签名、逐字节输出、拒绝类型/文本
   全部不变**，作为单向薄兼容垫片；品牌策略在垫片中登记为暂留兼容入口。公开导出面
   （`__all__）零变化。与板规"兼容入口薄、单向委托、零第二实现"一致。
2. **档 B（零字面：策略与兼容名整体归 H、bwrap `__all__` 删项）＝延期基线后**。其公开
   面变化（豁免 #2/#3/#4）超出本轮"不改公开语义"边界，汇总呈 I 随基线出口报告裁定，
   不由 C 自批。
3. **实施时序**：P 本轮不开；A' 精确路径增补件（前 notice 已派）候 P 复开（可在 S/E
   完成本批后轮换）再交。C×H 接缝确认（参数名、策略归属、`runtime-wsl` 测试路径与
   owner）在 A' 批文签发前完成即可，现在不重派、不预写。
4. 豁免 #1（kernel keyword-only 签名演进）在 A' 下**不再需要**——新 kernel 是内部新增，
   非旧公开函数签名变化；豁免 #5（五处注释据实更正）随 A' 批文机械执行；豁免 #6
   （垫片残留 def 名＝合规兼容名）按板规登记。

## 对各组的约束

- P：本裁定不是开工批文；P 复开后先交 A' 增补件，零产品码起步。
- H：本轮 bwrap 相关唯一可能工作是 C 另发的只读接缝确认（排在 kilo 之后，防双任务）；
  未收到前不读不改 bwrap/Codex 家代码以外的任何东西。
- 该边界现状（品牌字面位置、生产零装配死线）作为**边界反例**素材进入
  `baseline/packages/agent-box-sandbox-bwrap.md` 修订与最终依赖图，不算已清理完成。

## 补记 · H-040 接缝确认闭合（2026-09-22 13:4xZ）

`goal-H-040`（H 只读，绑 H 树 `7a1b2699`＋集成 `d12aa979`）交付并经 C 采信：
- 集成树 bwrap 三件与 P 树逐字节相同，报告 49 行号在权威基线成立；H 树为旧版但
  P1/P2/P3 策略三行跨树逐字稳定——**实施与行号以集成基线为准**。
- 策略真源三组值（guest exec 目标/secret 两落点/命令形状）在 H 侧全为纯字面值，
  可全量经参数供给；今日 `agent_box_harnesses` 与 `sandbox_bwrap` 零相互 import，
  接缝＝纯值传递、零模块依赖；`protocol.py`/`sandbox_port.py` 零改动判在 H 侧复核成立。
- 公开兼容面仓内风险全集＝三处测试（bwrap 两件＋runtime-wsl 注入）＋根 pyproject
  版本钉；仓内生产调用者＝0。**A' 批文签发前的接缝确认前置就此闭合**，实施仍候
  P 复开交 A' 增补件。
- 备查（不在两档范围）：runtime-wsl `test_interactive_channel.py:50`、
  `test_worker_client.py:170` import bwrap 私有 `_minimal_rootfs_argv`——机制层跨包
  测试耦合，bwrap 内部重构须保名或同步改测。
