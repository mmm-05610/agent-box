# agent-box-git — 资源包说明（MB-1c）· 本域重点自证件

> 状态＝**物理包**（独立 `pyproject.toml` + `src/` + `tests/` + entry point）。
> 锚＝P 树 `c1360f3`（含 INC2-B②＝候选 `a4ab628` 同内容）· 组 P · 2026-09-22T06:5xZ

## 职责
- 外部 Git 仓的精确 workspace：`GitWorkspaceResourceProvider`——`make_ref`/`resolve`（detach worktree 物化＋ownership marker 先行认领）/`capture`（快照→`refs/agent-box/executions/<id>/output`）/`cleanup`（清理族回执 `{cleaned|already_cleaned|{error}}`、无主护栏、幂等）。
- 类型化拒绝：`workspace_errors.py` 的 `GitWorkspaceErrorCode`（9 员插件局部）＋`GitWorkspaceRejected`（走既有 `CompositionRejected` 通道）——14 抛点已收敛（INC2-B②，#2 复用公共 `INVALID_BINDING`）。
- 终局贡献者 `GitFinalizationContributor`、仓库库 `RepositoryLibrary`、输入选择器 `GitWorkspaceSelector`。

## 非职责
- 不管理分支/远端/push；不回收 `refs/agent-box/.../output` ref（R-D 面、B1 留存线，§D 延期）；不做 per-agent 分支（6 号零命中）；**品牌词＝0（7a 检查，本件即 P 域重点自证：src 与 tests 零 codex/claude/opencode/qwen/… 命中）**。

## 公开接口（`__all__`）
`GitWorkspaceResourceProvider` · `GitFinalizationContributor`（＋`GitWorkspaceErrorCode`、`GitWorkspaceRejected`、`RepositoryLibrary`、`create_plugin`）。
Entry point：`git = agent_box_git.plugin:create_plugin`；provider_id＝`git-workspace`。

## 依赖
- 对核心**单向**：`agent_box.extensions`（runtime_composition.CompositionRejected/ErrorCode、api.FinalizationContribution/ResourceSelection）、`agent_box.resource_contracts.WorkspaceV1`、`agent_box.work_core`。
- 跨插件依赖＝**0**（`workspace_errors` 为包内自引用）；外部可执行＝`git`；pyproject 依赖 `pacthold==2.0.0a1`。

## 测试命令
```bash
PYTHONPATH="src:$(ls -d plugins/*/src | tr '\n' ':')" <venv>/bin/python \
  -m pytest plugins/agent-box-git/tests -q -p no:cacheprovider
```
实测：**18 passed / 0 failed**（4 文件；红-绿与根门差量证据见 `reports/46`、`CP-INC2-B2`）。

## 已知缺口（登记不展开，随板 §D）
- **B② 后半 7 枚裸 `ValueError`**：`inputs.py:23`、`repositories.py:22`、`contributor.py:27/:34/:37`、`plugin.py:25/:38`——R5 明裁「本批验收后另放」，板 §D 延期。
- **D17**：scope sanitizer 不过滤非 ASCII＋同形 scope（`E/1`/`E_1`/`E 1`）冲突；越界不可达、归契约层待裁（CP-P-T3 登记）。
- **R-D ref 无回收**：`update-ref refs/agent-box/executions/<id>/output` 全仓无对应 delete（r40＝B1 留存面结构账，§D 延期递出）。
