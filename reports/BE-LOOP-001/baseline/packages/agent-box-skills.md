# agent-box-skills — 资源包说明（MB-1c）

> 状态＝**物理包**（独立 `pyproject.toml` + `src/` + `tests/` + entry point）。
> 锚＝P 树 `c1360f3`（skills 面＝`d927c61`，已入候选 `16623db`）· 组 P · 2026-09-22T06:5xZ

## 职责
- 不可变本地 Agent Skills 快照：`SkillStore`——`import_directory`（`:202`，CAS 早退 `REVISION_CONFLICT :207`）/`get :232`/`list :238`/`disable :248`（陈旧令牌 CAS 早退 `:260`＝缺口 A 修毕；tmp 写段 try/except→rmtree 回滚＝缺口 B 修毕）。
- 选择与解析：`SkillSelector`、`LocalSkillSource`、`SkillSourcePort`、`ResolvedAgentSkill`；契约＝`AgentSkillV1`。

## 非职责
- **无删除动词、墓碑单调**（`disable` 只追加 disabled revision；全路径无 `unlink` 释放 revision——R-9「墓碑不得伪装成删除」的设计事实）；不扫历史孤儿（R-1：无归属者不得顺手删）；不做 per-agent 分支（6 号零命中）；品牌词＝0（7a）。

## 公开接口（`__all__`）
`ResolvedAgentSkill` · `SkillSourcePort` · `SkillStore`（＋`AgentSkillsPlugin`、`SkillSelector`、`LocalSkillSource`、`create_plugin`）。
Entry point：`skills = agent_box_skills.plugin:create_plugin`；`config_namespace=skills`。

## 依赖
- 对核心**单向**：`agent_box.extensions`（Plugin API/ResourceSelection）、`agent_box.resource_contracts.AgentSkillV1`、`agent_box.work_core`。
- 跨插件依赖＝**0**；pyproject 依赖 `pacthold==2.0.0a1`。

## 测试命令
```bash
PYTHONPATH="src:$(ls -d plugins/*/src | tr '\n' ':')" <venv>/bin/python \
  -m pytest plugins/agent-box-skills/tests -q -p no:cacheprovider
```
实测：**11 passed / 0 failed**（2 文件、8 函数×parametrize 展开；基线 10→含缺口 A 新钉 11）。

## 已知缺口（登记不展开，随板 §D）
- 缺口 A（陈旧令牌 typed 拒绝）与缺口 B（disable 孤儿泄漏）**均已修毕验收**（`16623db`＝CP-INC2-B1、P-T6＝CP-P-T6），此处只记状态不重开。
- 历史孤儿不回收＝无清理动词的结构后果，回收方案随 B1 留存线（§D 延期）；`disable` 失败语义仍为 `OSError` 类型（typed 化曾延 R-6/INC2——现缺口 A 后入口守卫已 typed，碰撞面已关）。
- `_write_index` 等白名单外相邻面＝CP-P-T6 只登记未动（守界记录）。
