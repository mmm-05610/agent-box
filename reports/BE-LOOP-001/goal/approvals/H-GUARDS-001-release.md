# H-GUARDS-001 · 旧 deploy 两枚 loopback-guard 等价移除微批

C · 2026-09-22 14:0xZ · 基线 backend integration
**`0c042f5499d1f8ebc843327f730bc529be065a14`**（kilo 后 HEAD，`CP-H-KILO.md`）。
H 为本批唯一写者。依据：`decisions/H-old-assets-disposal-ruling.md`（H-037 三通道
盘点：两枚 guard 运行时/测试/打包三通道零消费）。请在 H 组 `work/` 下新建隔离任务树
（新分支、自本基线），报路径/HEAD/clean 后实施。

## 允许的精确路径（恰 2 条删除，其余零改动）

- 删除 `plugins/agent-box-harnesses/deploy/dsh/loopback-guard.cjs`
- 删除 `plugins/agent-box-harnesses/deploy/qwen/loopback-guard.cjs`

明确不动：`deploy/dsh/settings.yaml`（兼容保留，裁定在案）；其余一切文件。

## 验收

1. 删除前重跑三通道零消费复查（grep 常量引用/测试/打包面），把读数写入交付件；
2. 插件面同配方门（7F/154P/3S，FAILED ID 与 kilo 基线同集）；
3. `HANDOFF_READY`＋停写回执；C 收后跑同环境配对根门（预期根门面零变化）、集成。
微批不混任何其他改动；不 add -A、不 push。
