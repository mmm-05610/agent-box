# P21 阶段 2 证据：合同编入 56/58/59/60/62/63/64 的新面（2026-09-18）

## 1 交付物

| 项 | 值 |
| --- | --- |
| 方法数 | 33 → **59**（新增 26） |
| TS 权威 sha256 | `6e8ae84a1abeb32c89b6761068ec3f380991bbf8497645626b700ed70cd5dedb` |
| 生成工件 sha256 | `f5d27269184aa387ce1227dbf8497e25b51e0d7ba5d3360f412e9b8cda33a583` |
| 工件条目 | 124（8 固定 + 59×2） |

## 2 形状的第一手来源（后端实现文件:行）

| 面 | 来源 |
| --- | --- |
| Git 六字段 | `src/agent_box/server/workspaces/git_status.py`（`GitStatus.as_wire`）+ `wire/handlers.py:1042-1084` |
| 执行清单 | `src/agent_box/server/execution/inventory.py:21-95` |
| 记忆 | `src/agent_box/server/profiles/memory.py:37-98` + `wire/handlers.py:953-999` |
| 克隆/迁移报告 | `src/agent_box/server/profiles/clone.py:50-145` + `wire/handlers.py:1086-1135` |
| 权限规则 | `src/agent_box/server/profiles/permissions.py:34-123` |
| 资产目录与绑定 | `src/agent_box/server/assets/records.py:100-240` |
| 目录式来源 | `src/agent_box/server/assets/catalog.py:45-235` |
| 代码资产预览 | `src/agent_box/server/assets/plugins.py:37-46,94` |
| MCP 探测 | `src/agent_box/server/assets/mcp_probe.py:44-106` |
| hooks 视图 | `src/agent_box/server/hooks/records.py:151-173`、`hooks/model.py:109-199` |
| trigger 视图 | `src/agent_box/server/hooks/triggers.py:39-49,108-140` |
| 账户视图 | `src/agent_box/server/accounts/records.py:100-111` |
| 参数集合 | `src/agent_box/server/wire/handlers.py:64-163`（`_PARAM_SHAPES`） |
| 方法表 | `src/agent_box/server/wire/handlers.py:315-380`（`_handlers`） |

## 3 核对时发现的后端事实（只登记，不写后端仓）

1. **`providerArtifacts.install` 参数表与 handler 不一致**：

   ```python
   # handlers.py:125-130
   "providerArtifacts.install": ({"requestId", "harness", "version", "sourceToken"}, set()),
   # handlers.py:1236
   receipt = store.install(harness, version, source, params["digest"])
   # handlers.py:386-393
   extra = set(params) - required - optional   # -> INVALID_REQUEST: unexpected digest
   ```

   结果：带 `digest` 被拒、不带 `digest` handler 取键失败 ⇒ 该方法当前无可用调用形态。
   本树合同保留 `digest`（与 handler 一致），并把此条交回调度者转后端。

2. **`assets.installFromCatalog` 返回 snake_case**：`{"installed": {"asset_id", …}}`
   （`assets/catalog.py:198-200`），是全 59 方法里唯一的 snake_case 字段名。合同如实编码。

3. **hooks `effect` 是三值**：`blocked / ran / failed`（`triggers.py:39-49` 的
   `classify_exit`）；同文件顶部 docstring 只提到两值——以代码为准，合同用三值闭枚举。

## 4 刻意不编入

| 后端方法 | 原因 |
| --- | --- |
| `profiles.subagentGrants` / `grantSubagent` / `revokeSubagent` | Order 65（manifest: PARTIAL，仍在飞） |
| `usage.aggregate` / `usage.export` | Order 53 未收口 |

未收口的单不冻进合同；收口后单独重锁。

## 5 门（阶段 2 范围）

```bash
cd apps/desktop && npx tsc --noEmit                      # exit 0
cd apps/desktop && npx vitest run src/types/wire/wire-v1.test.ts --project ui --reporter=dot
#   Test Files 1 passed (1) / Tests 28 passed (28)
```

四项全量（tsc / eslint / build / vitest）在阶段 4 跑并记计数。

**注**：工单 Validation 写的 `npx vitest run --reporter=basic` 在本仓 vitest 4.1.10 下不可用
（`basic` reporter 已在 vitest 3 移除，报 `ERR_LOAD_URL`）；改用仓内既有入口
`--project ui --reporter=dot`，口径不放宽（同一次全量 run 的计数仍在阶段 4 记）。
