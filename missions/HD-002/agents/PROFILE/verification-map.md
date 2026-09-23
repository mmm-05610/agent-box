# PROFILE 验收映射（BC-0002 §验收 → 具名测试）

本包 SHA：BE `f3bcbde9` / FE `e869683469`。BC-0026 已裁**独立插件验证收件完成**且未代跑门，故本表把「哪条验收项由哪个具名测试负责」固定下来，供接缝批与后续复现对照；不新造结论，只列现有证据位置。

| BC-0002 §验收 | BE（58 tests，`python3 -m unittest discover -s tests`） | FE（12 tests，`node --test` 编译副本） |
| --- | --- | --- |
| revision 冲突 | `test_store.py:38 update_is_compare_and_set`、`test_resolver.py:169 launch_follows_only_the_pinned_revision` | `model.test.ts:103 a save names the revision it read, and a stale save is refused` |
| 重复注册报冲突 | `test_registry.py:19 duplicate_kind_version_conflicts_without_replacing` | `model.test.ts:87 editors_are_claimed_per_kind@version…`、`:192 contributions…duplicates clash` |
| 扩展卸载后失效 | `test_registry.py:37/49/55 scope_dispose_releases_registrations / disposed_scope_cannot_register_again / unload_of_one_contributor_leaves_the_other` | `model.test.ts:87`、`entry.test.ts:74 disposing_the_owned_resource_releases_contributions_without_touching_another_owner` |
| 未知值无损往返 | `test_record.py:37`、`test_store.py:59`、`test_resolver.py:108 unknown_kind_is_saved_losslessly_and_refused_at_launch` | `model.test.ts:61 canonical_text_keeps_what_the_UI_does_not_understand` |
| 路径/秘密负例 | `test_record.py:71/76/81/86/102` | `model.test.ts:41 a_location_or_a_secret_never_enters_an_editable_record` |
| 同一记录在两种模拟 home 解析、记录字节不变 | `test_resolver.py:48 the_same_record_bytes_resolve_differently_per_home` | —（BE 权威，FE 不替代） |
| 一项失败无副作用 | `test_resolver.py:76 one_failing_selection_leaves_the_environment_untouched`、`:100 preview_never_reports_applied` | —（同上） |
| 无插件默认路径不受影响 | `test_isolation.py:49/61 importing_registers_nothing / a_registry_appears_only_where_a_caller_made_one`、`test_resolver.py:177` | `entry.test.ts:43 without_a_port_the_plugin_contributes_nothing_it_cannot_honour` |
| FE 无编辑器只读保留 | — | `model.test.ts:208 read-only/unlaunchable/unsupported`、`entry.test.ts:50`（真渲染断言画出 `read-only` 与 `<code>` 原文） |
| FE 连接切换使可用性失效 | — | `model.test.ts:132 readiness_belongs_to_the_connection…`、`:171 an_in-flight_availability_answer_is_dropped…` |

## 本表同时固定的三件事实（不外推）

1. 门是**本包自跑**且跑在**借用工具链**（`/tmp` 镜像 + 姊妹树 `fc/node_modules`，零安装）上，不是本工作区 CI 门；app vitest include 仍不含本包测试。
2. 覆盖仅到**独立插件验证**：接缝验证、产品装配、用户验收**未做**。宿主挂载形状见 PROFILE-0006 §2（本包 `component` 不能直接进 `root.mount`，需接缝批裁形态）。
3. 两处口径修正属于本表所述证据之后加入：0004 让管理视图真正出内容、0005 让 `parseRecord` 与 BE `from_dict` 同口径拒载未知顶层字段；0006 收回「真正可挂载」措辞。

## 复核时间戳（2026-09-23）

- BE：在 `f3bcbde9` **现跑** `PYTHONPATH=src python3 -m unittest discover -s tests -p "test_*.py"` → `Ran 58 tests … OK`，跑后 `git status --porcelain` 仍空（无写产物）。
- FE：在 `e869683469` 现跑于 `/tmp` 镜像（同一借用 TS 6.0.3）→ tsc `--noEmit` exit 0、CJS 出件 exit 0、`node --test` **12 passed / 0 failed**、esbuild `/tmp` 15.4kb；产品树 `git status --porcelain` 空。
