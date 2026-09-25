# agent-box-artifacts — 资源包说明（MB-1c）

> 状态＝**物理包**（独立 `pyproject.toml` + `src/` + `tests/` + entry point）。
> 锚＝P 树 `c1360f3` · 组 P · 2026-09-22T06:5xZ

## 职责
- 不可变本地文本 artifact 的 prompt 片段提供者：`ArtifactPromptResourceProvider`——`descriptor`/`make_ref`/`resolve`（`provider.py:31/:34/:40`）＋选择器 `ResponsibilitySelector`（`selector.py:24 prepare`＝`mkdir:29`+`write_text:31` 落盘、`bind_registry:21`）。
- 引用身份＝`_sha256`/`_file_uri_path` 归一（`provider.py:12/:16`）。

## 非职责
- **无 release/cleanup 动词**（公开面穷尽＝descriptor/make_ref/resolve＋prepare/bind_registry＋注册三件，r22/r23 全量枚举证成）；不回收已落盘件（R-8 取「显式声明不提供回收」档已入 `C-RES@v1` §8）；不做删除、不做清理激活；不做 per-agent 分支（6 号零命中）；品牌词＝0（7a）。

## 公开接口（`__all__`）
`ArtifactPromptResourceProvider` · `ArtifactsPlugin` · `create_plugin`（＋包内 `ResponsibilitySelector`）。
Entry point：`artifacts = agent_box_artifacts.plugin:create_plugin`。

## 依赖
- 对核心**单向**：`agent_box.extensions`（Plugin API/ResourceSelection）、`agent_box.resource_contracts.PromptFragmentV1`、`agent_box.work_core`（含 `agent_box_home`）。
- 跨插件依赖＝**0**；pyproject 依赖 `pacthold==2.0.0a1`。

## 测试命令
```bash
PYTHONPATH="src:$(ls -d plugins/*/src | tr '\n' ':')" <venv>/bin/python \
  -m pytest plugins/agent-box-artifacts/tests -q -p no:cacheprovider
```
实测：**2 passed / 0 failed**（2 文件）。

## 已知缺口（登记不展开，随板 §D）
- **D4**：brief 明文永久落盘且无释放动词——**留存/秘密政策挂 IFR-01 交 I**（板 §D：IFR-01 留存参数基线后另线）；能力缺失本身已按 R-8 进契约，不属本包可自修面。
- 落盘即写、无人回收的结构事实＝B1 留存包的硬事实底座（r22/R-8），递出在 §D 延期。
