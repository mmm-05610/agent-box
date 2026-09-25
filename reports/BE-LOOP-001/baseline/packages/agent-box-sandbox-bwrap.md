# agent-box-sandbox-bwrap — 资源包说明（MB-1c）

> 状态＝**物理包**（独立 `pyproject.toml` + `src/` + `tests/` + entry point）。
> 锚＝P 树 `c1360f3` · 组 P · 2026-09-22T06:5xZ

## 职责
- provider-neutral bubblewrap 沙箱：`BwrapSandboxProvider` 的 allocate/wrap/cleanup（租约盘上记录 `data_dir/leases/<digest>.json` 把关，无记录即 `already_cleaned` 不碰任何东西）。
- 秘密挂载**准备面**：`register_prepared_secret_mount` 只记账、无 transport（`--ro-bind` 只传路径、构造器自陈 emits no secret contents）。
- guest 房间组合：`compose_sidecar_room`（通用 sidecar 启动计划）、`guest_environment`（单一 home 根派生 XDG）、remote 模板编译 `compile_remote_bwrap_argv` / `compile_remote_sidecar_bwrap_argv`。
- runtime-artifact 校验（`validate_runtime_artifact_target` 等）与 home-projection 目标校验（`home_projection_target`、`protected_state_paths`）——定义在本包、语义由 `resource_contracts` 承载。

## 非职责
- 不落盘任何秘密内容（R-8「显式声明不提供回收」档）；不做 Profile/终端/git/skills 语义；不解析凭据（解析在 H `codex/credentials.py`）；不做通用 home 框架（只执行契约给定的目标校验）。

## 公开接口（`__all__`）
`BwrapSandboxProvider` · `PROVIDER_ID` · `compile_remote_bwrap_argv` · `compile_remote_sidecar_bwrap_argv` · `SandboxRoom` · `compose_codex_room` · `compose_sidecar_room` · `guest_environment` · `BwrapSidecarRoomPort` · `create_sidecar_room_port` · runtime-artifact 族（`RuntimeArtifactRejected`/`validate_runtime_artifact_target`/digest helpers）· home-projection 族（`GUEST_HOME`/`HomeProjectionRejected`/`home_projection_target`/`protected_state_paths` 等）。
Entry point：`sandbox_bwrap = agent_box_sandbox_bwrap.plugin:create_plugin`；provider_id＝`bwrap-sandbox`。

## 依赖
- 对核心**单向**：`agent_box.extensions`（含 `runtime_composition.SandboxUnavailable`、`credentials.PreparedSecretMount`、`capability`）、`agent_box.work_core`、`agent_box.resource_contracts`（home_projection/runtime_artifacts）。
- 跨插件依赖＝**0**；外部可执行＝`/usr/bin/bwrap`（测试面需本机 bwrap）；pyproject 依赖 `pacthold==2.0.0a1`。

## 测试命令
```bash
PYTHONPATH="src:$(ls -d plugins/*/src | tr '\n' ':')" <venv>/bin/python \
  -m pytest plugins/agent-box-sandbox-bwrap/tests -q -p no:cacheprovider
```
实测：**152 passed / 0 failed**（10 文件、82 函数×parametrize 展开）。

## 已知缺口（登记不展开，随板 §D）
- **品牌词事实（src 内 12 处，脚本 7b 三类分拣，判定归 C）**：
  1. 固定 WSL 模板拼写/报错文本 5 处——`provider.py:115/:116/:118/:144`（`/runtime/bin/codex` guest 路径与 "Codex template" 报错，`compile_remote_bwrap_argv` 的**单一固定模板**，非条件分支）＋ `:84` 注释；
  2. 导出名 3 处——`compose_codex_room`（`sidecar_room.py:147`＋`__init__.py:27/:42`；实现零品牌分支、纯委托通用编译器）；
  3. 解释性注释 4 处——`sidecar_room.py:90/:91/:99/:100`（`$CODEX_HOME`/`.codex`/opencode 路径解释）。
  **性质**：固定模板＋命名＋注释，**无 per-agent 条件判别**（6 号检查零命中；`compose_sidecar_room` 通用支持多品牌投影目标，tests 有 hermes/opencode 实例）。是否算品牌偷渡、是否入 MB 拆包处理＝**C 裁**，P 不自行改码。
- 两枚非判别钉：`test_remote_bwrap.py:78` 等用 `pytest.raises(Exception)`，词表收敛在红-绿上看不见（r31 登记，验收措辞已用）。
- `MAX_EPHEMERAL_MOUNTS` 等容量上限＋remote `secret_target` 白名单两值＝模板策略，非缺陷。
