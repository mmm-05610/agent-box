# Work Order 57 阶段 A —— 逐家 harness 工件来源与版本标识（观察）

执行：2026-09-18，env-provider 工作树。**零模型调用、零代码改动**——只读公开注册表查询
（npm registry / GitHub API）与本仓既有安装集记录的核对。本观察是安装/更新/回滚实现的前提。

## 逐家结论

| 家族 | 本仓工件 | 上游官方来源 | 最新版本（本轮实测） | 签名/证明 | 自更新行为 |
| --- | --- | --- | --- | --- | --- |
| pi | `@automatalabs/pi-acp` 闭包（317 包 / 64.9 MiB，含 adapter 0.5.0 钉住） | npm registry（公开） | adapter 上游 latest=**0.9.1**（我们钉 0.5.0） | npm `dist.signatures` ✓ + attestations ✓ | 无内建自更新（CLI 由 npm 管理） |
| codex | `@openai/codex` 20 包 / 320.8 MB（vendor 二进制 0.147.0 钉住） | npm registry（公开） | 上游 latest=**0.154.0**（我们钉 0.147.0） | npm signatures ✓ + attestations ✓ | 无自动更新（配置控制）；上游 0.154 变更需重验 |
| opencode | `opencode-ai` 单文件二进制 184 MB（1.18.21 钉住） | npm registry（公开）+ GitHub `sst/opencode` releases | npm latest=**1.18.31** | npm signatures ✓；attestations 无 | 无自动更新 |
| hermes | 隔离 Python 闭包 60 包 / 108 MB（0.19.0 钉住） | **无公开来源**（内部隔离闭包，官方 pypi 无对应包；pypi `hermes-cli` 0.0.1.4 为无关项目） | 钉 0.19.0 | 仅摘要固定（无上游签名可验） | 无自动更新（隔离闭包禁网面） |
| dsh | `~/.dsh/sessions` 形态；安装集走内部构建 | 同 hermes：内部闭包 | 本机样本有限 | 仅摘要固定 | 无 |
| kilo | `kilo acp`（OpenCode fork 系） | npm `kilo`（待精确包名核实） | 待核实 | 待核实 | 无 |
| qwen | `~/.qwen` 形态 | 本机无实例 | 待核实 | 待核实 | 待核实 |
| claude-code | 走既有 install-set | npm `@anthropic-ai/claude-code`（待精确版本核对） | 待核实 | 待核实 | 待核实 |

## 关键结论

1. **npm 系三家（pi/codex/opencode）来源与证明充分**：registry 的 `dist.signatures`（ECDSA）与
   `attestations`（npm provenance）公开可得，`dist.shasum` 是钉住摘要。**目录来源 = registry
   的版本列表**（`https://registry.npmjs.org/<pkg>` 全量 versions + dist-tags），无需 GitHub。
2. **hermes/dsh 是内部隔离闭包**：官方来源=本地 builder（43 代的隔离 Python 闭包管线），
   "仅摘要固定"如实标注（无上游签名可验）；"可更新"= builder 重跑出新闭包。
3. **钉住与自更新**：本仓的各家 deployment **已把版本钉在受审配置里**（codex 0.147.0、
   pi adapter 0.5.0、opencode 1.18.21、hermes 0.19.0、dsh/kilo/qwen 各自钉住），
   harness 的自更新通道（若有）被我们的钉住方式排除——升级 = 换钉住的版本 + 重验，
   与工单 §2 的"版本目录 + 引用"模型一致。
4. **来源检索的诚实记录**：用户点名的 codeg 两次检索未取得结果（不拿猜到的项目当参照）；
   claude-code/qwen/kilo 的精确上游版本本轮未逐一核对（npm registry 同一接口可得，
   留 B 阶段实现目录同步时机械核对）。

## 对实现的输入（阶段 B 的设计输入）

- **目录（catalog）**：`https://registry.npmjs.org/<pkg>` 的 versions 映射即上游索引
  （dist-tags.latest 标"可更新"）；同步 = 一次有界 GET + 摘要比对，失败不阻塞。
- **取得**：npm tarball（`dist.tarball` URL，shasum 钉住）→ 在执行侧重推导 tree digest v1
  → 原子入 `<工件根>/<family>/<version>/`。hermes/dsh：builder 重跑产出。
- **版本钉住的兼容性**：换钉住的版本时受审配置（models/settings/config.yaml）须按该
  版本重审——deployment 的版本钉住字段如实携带"最近一次生效版本"。
