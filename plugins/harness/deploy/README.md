# deploy/ — 运行链的部署模板与兼容资产

逐项核查（2026-09-24）：本目录里**只有运行链真正读取的原生配置**留在原地。
"运行链读取"= `production.py` 把它拼成 `projectionFiles[].source`，Server 按
插件根相对路径读字节并进 reviewed bundle（`bootstrap/runtime.py:712-741` 的
`_sidecar_deployment_file`），最终只读投影进 guest 的 `/runtime/home/...`。

可选安装打包的东西不放这里，见 `../packaging/README.md`。

## 1. 运行链模板（保留，被主运行链读取）

| 文件 | 消费方 |
| --- | --- |
| `codex/config.toml` | `codex/production.py:123` `CONFIG_SOURCE` |
| `codex/models.json` | `codex/production.py:124` `MODELS_SOURCE` |
| `pi/models.json` | `pi/production.py:117` `MODELS_SOURCE` |
| `pi/settings.json` | `pi/production.py:118` `SETTINGS_SOURCE` |
| `claude/settings.json` | `claude/production.py:95` `SETTINGS_SOURCE` |
| `dsh/settings.yaml` | `dsh/production.py:128` `SETTINGS_SOURCE` |
| `qwen`（无配置模板） | 该家族只留 guard，见下 |
| `kilo/kilo.json` | `kilo/production.py:79` `CONFIG_TEMPLATE` |
| `opencode/opencode.json` | `opencode/production.py:114` `CONFIG_SOURCE` |
| `hermes/config.yaml` | `hermes/production.py:169` `CONFIG_SOURCE` |

## 2. 旧隔离 guard —— 兼容资产（保留，不新增启用）

下列文件是**离线审查资产**：只在不得触网的链门里编译/投影，用来观察启动期
网络行为。生产部署模板从不引用它们（各家族的模板测试断言生产默认里没有
`LD_PRELOAD`、没有 guard 路径）。**本轮不新增启用**：不新增引用方、不把
任何 guard 接入新的家族或新的运行模式。

| 文件 | 常量 / 现有消费方 |
| --- | --- |
| `claude/egress-guard.c` | `claude/production.py:99` `LOOPBACK_GUARD_SOURCE`；`claude-production-chain-gate.py` |
| `kilo/egress-guard.c` | `kilo/production.py:83` `LOOPBACK_GUARD_SOURCE`；`kilo-production-chain-gate.py` |
| `opencode/egress-guard.c` | `opencode/production.py:112` `EGRESS_GUARD`；`opencode-production-chain-gate.py` |
| `dsh/loopback-guard.cjs` | `dsh/production.py:125` `LOOPBACK_GUARD`；`dsh-production-chain-gate.py` |
| `pi/loopback-guard.cjs` | `pi/production.py` `LOOPBACK_GUARD`；`pi-production-chain-gate.py` |
| `qwen/loopback-guard.cjs` | `qwen/production.py:100` `LOOPBACK_GUARD`；`qwen-production-chain-gate.py` |
| `hermes/loopback-guard.py` | `hermes/production.py` `LOOPBACK_GUARD`；`hermes-production-chain-gate.py`（门内投影为 `sitecustomize.py`） |

## 3. 已移出本目录的（归属变更）

| 原路径 | 现路径 | 理由 |
| --- | --- | --- |
| `opencode/driver-native.mjs` | `runtime/drivers/opencode-native.mjs` | 被 sidecar 加载执行的**运行辅助代码**，不是模板；`DRIVER_SOURCE` 同步改 |
| `codex/codex-deepseek-setup.sh` | `packaging/codex/provenance/` | 上游官方安装器字节，只做 provenance 证据 |
| `codex/official-script.json` | `packaging/codex/provenance/` | 上一条的 sha256 元数据 |

## 4. 归属不确定、本轮保留原位并报告

`hermes/bootstrap.py` 与 `hermes/sitecustomize.py` 同时命中两类定义：文件内容
是 guest 里**实际执行**的代码（CPython 启动即 import `sitecustomize`），但在
源码树里唯一的读取方是**打包器** —— `build-hermes-runtime-artifact.mjs:82,100-101`
把它们作为 overlay 复制进工件，并在工件清单里写下
`source: "deploy/hermes/<file>"`（同文件 1053 行），
`hermes-production-chain-gate.py:693` 又断言该前缀。把它们移进 `packaging/`
要么改掉工件清单里的 provenance 标签（等于改记录、进而改 tree digest），要么
留下一个说谎的标签。两者都不是"纯移动"，因此本轮**不猜、不动**，保留原位并在
此登记。建议：若确认要移，连同标签一起改，并在一次有真实工件构建的环境里重跑
`hermes-production-chain-gate.py` 与 `build-hermes-runtime-artifact.test.mjs`。
