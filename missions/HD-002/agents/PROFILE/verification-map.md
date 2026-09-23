# PROFILE 验收映射（BC-0002 §验收 → 具名测试）
本包 SHA：BE `f3bcbde9` / FE `e869683469`。BC-0026 已裁**独立插件验证收件完成**且未代跑门，故本表把「哪条验收项由哪个具名测试负责」固定下来，供接缝批与后续复现对照；不新造结论，只列现有证据位置。

| BC-0002 §验收 | BE（下表各行是 58-tests 期钉下的具名门；08:33 起套件为 **73 tests**） | FE（下表为 12-tests 期；08:33 起为 **17/17**） |
| --- | --- | --- |
| revision 冲突 | `test_store.py#test_update_is_compare_and_set`、`test_resolver.py#test_launch_follows_only_the_pinned_revision` | `model.test.ts#「a save names the revision it read, and a stale save is refused」` |
| 重复注册报冲突 | `test_registry.py#test_duplicate_kind_version_conflicts_without_replacing` | `model.test.ts#「editors are claimed per kind@version and released with their scope」`、`:192 contributions…duplicates clash` |
| 扩展卸载后失效 | `test_registry.py#test_scope_dispose_releases_registrations ＋ :49/:55 「test_disposed_scope_cannot_register_again」/「test_unload_of_one_contributor_leaves_the_other」` | `model.test.ts:87`、`entry.test.ts#「disposing the owned resource releases contributions without touching another owner」` |
| 未知值无损往返 | `test_record.py#test_round_trip_keeps_unknown_selections`、`test_store.py#test_unknown_and_future_versioned_selection_round_trips_unchanged`、`test_resolver.py#test_unknown_kind_is_saved_losslessly_and_refused_at_launch` | `model.test.ts#「canonical text keeps what the UI does not understand」` |
| 路径/秘密负例 | `test_record.py#test_absolute_and_home_paths_are_rejected＋:76/:81/:86/:102 四例同名前缀见 §实名清单` | `model.test.ts#「a location or a secret never enters an editable record」` |
| 同一记录在两种模拟 home 解析、记录字节不变 | `test_resolver.py#test_the_same_record_bytes_resolve_differently_per_home` | —（BE 权威，FE 不替代） |
| 一项失败无副作用 | `test_resolver.py#test_one_failing_selection_leaves_the_environment_untouched`、`:100 preview_never_reports_applied` | —（同上） |
| 无插件默认路径不受影响 | `test_isolation.py#test_importing_the_package_registers_nothing ＋ :61 test_a_registry_appears_only_where_a_caller_made_one`、`test_resolver.py#test_an_empty_record_needs_no_registrations` | `entry.test.ts#「without a port the plugin contributes nothing it cannot honour」` |
| FE 无编辑器只读保留 | — | `model.test.ts#「read-only, unlaunchable and unsupported stay three different answers」`、`entry.test.ts:50`（真渲染断言画出 `read-only` 与 `<code>` 原文） |
| FE 连接切换使可用性失效 | — | `model.test.ts#「readiness belongs to the connection that measured it」`、`:171 an_in-flight_availability_answer_is_dropped…` |

## 本表同时固定的三件事实（不外推）

1. 门是**本包自跑**且跑在**借用工具链**（`/tmp` 镜像 + 姊妹树 `fc/node_modules`，零安装）上，不是本工作区 CI 门；app vitest include 仍不含本包测试。
2. 覆盖仅到**独立插件验证**：接缝验证、产品装配、用户验收**未做**。宿主挂载形状见 PROFILE-0006 §2（本包 `component` 不能直接进 `root.mount`，需接缝批裁形态）。
3. 两处口径修正属于本表所述证据之后加入：0004 让管理视图真正出内容、0005 让 `parseRecord` 与 BE `from_dict` 同口径拒载未知顶层字段；0006 收回「真正可挂载」措辞。

## 复核时间戳（2026-09-23）

- BE：在 `f3bcbde9` **现跑** `PYTHONPATH=src python3 -m unittest discover -s tests -p "test_*.py"` → `Ran 58 tests … OK`，跑后 `git status --porcelain` 仍空（无写产物）。
- FE：在 `e869683469` 现跑于 `/tmp` 镜像（同一借用 TS 6.0.3）→ tsc `--noEmit` exit 0、CJS 出件 exit 0、`node --test` **12 passed / 0 failed**、esbuild 出件 `/tmp/pf-ext/ordessa.profile/entry.js` = **15453 bytes**；产品树 `git status --porcelain` 空。

## 复核时间戳（2026-09-23 08:33，v0.2 四项差量交付后现跑）

BE `96cdc337`（← `58074749` ← `f3bcbde9`）`unittest discover` **73 tests OK**（58→66→73）；FE `a1baa218a2`（← `ba748793e8` ← `e869683469`）在 `/tmp` 镜像＋借用工具链上 tsc `--noEmit` exit 0 → CJS 出件 exit 0 → `node --test` **17/17**（12→15→17）→ esbuild 于规范 cwd 出件 **17152 bytes**。两树 `git status --porcelain` 各 **0** 行、`git branch -r --contains HEAD` 命中 **0**（四提交全未 push）。新增面：`store#clone`、`portable.py`（`export_bundle`/`inspect_bundle`/`import_bundle`＋`store#import_bundle`）、`root.tsx#createProfileRoot`（零 props）、`demo.ts#runDemo`（明标测试端口、不在产物内）。PresetPort 加 `list(connectionId)`，属**本包自有的端口形状**（`contracts/**` 一字未动）。

下面 07:07/04:36 两段是本包写域与门的**历史**证据，数字属当时那次跑，不与今日可比（尤其产物数受 cwd 影响，见配方第 4 条）。

## 复跑配方（供暂停/接手后不重新摸索，均为本机实测过的形状）

本机事实先记账，否则会白试：这台机器的 Node 构建**没有 TypeScript 支持**（直接跑 `.ts` 报 `ERR_NO_TYPESCRIPT`），没有 `pytest`，`uv` 建的 venv 里没有 `pip`；仓库内**零安装**是本包的边界，所以借用姊妹树 `harness-desktop-002/fc/node_modules`（实测存在 `typescript/bin/tsc` = Version 6.0.3、`.bin/esbuild`）跑门，产品树与被测提交都不因此改动。借用根路径为绝对 `/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/fc/node_modules`，从 `profile/backend/plugins/...` 用 `../../fc` 之类相对路径**够不到**（本轮照错写法实测 `No such file or directory`）。

1. 镜像：`mkdir -p /tmp/pf-run/{plugins,platform}` → 拷 `frontend/plugins/profile`、`frontend/platform/extension-api` → `ln -s <上面那个绝对路径> /tmp/pf-run/node_modules`。
2. 类型门：`node <fc>/node_modules/typescript/bin/tsc -p plugins/profile/tsconfig.json --noEmit` → exit 0（含 `src/*.tsx` 与 tests）。
3. 为跑 `node --test` 需先出 CJS 副本，**必须以项目 tsconfig 为底**，在镜像根目录跑：`node <fc>/node_modules/typescript/bin/tsc -p plugins/profile/tsconfig.json --noEmit false --outDir cjs --rootDir . --module commonjs --rewriteRelativeImportExtensions --esModuleInterop` → exit 0，产物落在 `cjs/plugins/profile/{src,tests}/*.js`，随后 `cd cjs/plugins/profile && node --test tests/*.test.js` → **12 passed / 0 failed**。两个必踩的坑：(a) 只用命令行文件列表（`tsc plugins/profile/tests/*.ts …`）**过不了**，会报 `TS6142 --jsx is not set` 与 `TS7006`，因为绕开了 tsconfig 的 `jsx/strict/paths`；(b) 不加 `--rootDir .` 会以 `TS5011` 失败（TS 6 要求显式 rootDir 才能定出文件布局）。另**不要**传 `--moduleResolution node10`：TS 6 以 `TS5107` 直接失败（本包两次踩过）。
4. 产物门：复刻 `tooling/build-extension.mjs` 的选项（bundle/splitting/esm/browser/jsx automatic + 同 externals）用 esbuild 出到 `/tmp/pf-ext/ordessa.profile`，**因为 `buildExtension` 的 `outputRoot` 是 `products/agent-desktop/dist`，属产品装配、在本包写域外**；出件 exit 0。**（08:32 新增硬规则，defect ㉕）产物字节数与跑门 cwd 绑定**：同一棵树、同一脚本，`cd` 到 mirror 的 `cjs/plugins/profile` 出 **17638 bytes**、`cd` 到**产品树根**出 **17152 bytes**，各复跑两次均可复现 ⇒ 出件前必须 `cd /home/maoqh/projects/ordessa/worktrees/harness-desktop-002/profile`（本包规范 cwd），记账时把 cwd 与 bytes 同写；历史数字凡未带 cwd 的都属**不可比**，不得据其判"退化/增长"。本包规范形状当前为 `entry.js` = **17152 bytes**（单文件、含 `createProfileRoot`，`grep -c runDemo` = 0 ⇒ 演示不在 shipped 路径）。**这一步的脚本必须照抄，不要重新摸索**（`/tmp` 不跨重启，原文如下，跑法 `node /tmp/pf-build-check.mjs`）：

   ```js
   import { build } from '/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/fc/node_modules/esbuild/lib/main.js'
   import { mkdir } from 'node:fs/promises'
   const dir = '/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/profile/frontend/plugins/profile'
   const target = '/tmp/pf-ext/ordessa.profile'
   await mkdir(target, { recursive: true })
   await build({
     entryPoints: { entry: `${dir}/src/entry.tsx` },
     outdir: target, bundle: true, splitting: true, format: 'esm', platform: 'browser',
     jsx: 'automatic',
     external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@ordessa/extension-api', '@extensions/*'],
     metafile: true, logLevel: 'info',
   })
   ```

   两点注意：`dir` 直接指**产品树**（esbuild 只读它、不写），所以第 1 步的 `/tmp` 镜像对本步不是必需；`target` 必须在 `/tmp`，理由同上不写产品装配目录。

5. BE：`PYTHONPATH=src python3 -m unittest discover -s tests -p "test_*.py"` → `Ran 58 tests … OK`（系统解释器 3.14，无安装）。**必须 `cd` 到 `profile/backend/plugins/agent-box-profile-preset/` 再跑**：在 backend 仓库根跑会命中主线自己的 `src/` 与 `tests/`，本轮实测得到误导性的 `Ran 9 tests … FAILED (errors=9)`，那不是本包回归。加 `PYTHONDONTWRITEBYTECODE=1` 可保证跑后 `git status --porcelain` 仍空。分发级隔离证明另有 `python3 -m pip wheel --no-deps --no-build-isolation --no-index -w /tmp/pfwheel .`，其 11 条目无 `entry_points.txt`、`METADATA` 无 `Requires-Dist`。
6. **绝不跑** `tooling/build-all.mjs`：它自动发现带 `ordessa.id` 的 `plugins/**/package.json` 并重写已提交的 `products/agent-desktop/extensions.lock.json`（该风险仍是活的，处置权在 FC/C，见 status 的 `synced_facts`）。

本配方**四步全部于 04:36 当场实测通过**（BE 58 tests OK；FE 在 `e869683469` 的镜像上 tsc `--noEmit` exit 0 → CJS 出件 exit 0 → `node --test` 12 passed / 0 failed → esbuild exit 0、`entry.js` 15453 bytes 且 `grep -c ProfilePanel` = 2），跑后两树 `git status --porcelain` 仍全空、零安装、零网络、零真实模型调用。第 3 步的命令行形状是这次跑出来的**修正版**：上一版记的「只用命令行文件列表 + `--types node`」实测不能通过。若将来复跑与此处不符，以现跑输出为准并把差异登记进 status。本表只声明「独立插件验证」，复跑全绿也不构成接缝验证、产品装配或用户验收。

## 口径更正（2026-09-23 04:42，字节数为准）

本表此前把产物大小写成「15.4kb」，而同一提交（FE `e869683469`）的 commit message 也沿用了这个数；esbuild 自己打印的是 15.1kb。现核对到唯一无歧义的事实：**该产物只有一个文件 `entry.js`，15453 bytes**（`wc -c` 实测）。15453/1024 = 15.09 → esbuild 按二进制单位打印 **15.1kb**；15453/1000 = 15.453 → 十进制单位**截断**读作 15.4（若四舍五入则是 15.5，所以「15.4」连十进制口径下也不是四舍五入得来的）。**两个读数指向同一件、同一提交，不是矛盾也不是重跑退化**，但「kb」这个词在本包记录里有两种底数，后续一律写 bytes。这纯粹是本表自身的表述缺陷，与被验对象无关；产品树未因此改动（两树 `git status --porcelain` 仍空）。

## v0.2 §验收 逐项映射（08:51 现跑；权威句见 `profile-blueprint-v0.2.md#「验收含CAS冲突、未知字段往返、重复注册/卸载、缺能力诊断、预览零副作用、无props根视图与注入端口可独立渲染、新测试贡献不改核心。」`）

本表逐项**对回真实测试名**（BE `#test_实名`、FE `#「原题」`，行号由门自解），名字与存在性由 §`codesite_gate_0754` 机检；只声明"独立插件验证"这一状态。

| v0.2 验收项 | BE | FE |
| --- | --- | --- |
| CAS 冲突 | `test_store.py#test_update_is_compare_and_set`、`#test_save_creates_then_cas` | `model.test.ts#「a save names the revision it read, and a stale save is refused」` |
| 未知字段往返 | `test_record.py#test_round_trip_keeps_unknown_selections`、`test_store.py#test_unknown_and_future_versioned_selection_round_trips_unchanged`、`test_resolver.py#test_unknown_kind_is_saved_losslessly_and_refused_at_launch` | `model.test.ts#「canonical text keeps what the UI does not understand」` |
| 重复注册／卸载 | `test_registry.py#test_duplicate_kind_version_conflicts_without_replacing`、`#test_scope_dispose_releases_registrations`、`#test_disposed_scope_cannot_register_again`、`#test_unload_of_one_contributor_leaves_the_other` | `model.test.ts#「contributions are optional data: duplicates clash and scope close clears」`、`entry.test.ts#「disposing the owned resource releases contributions without touching another owner」` |
| 缺能力诊断 | `test_resolver.py#test_a_missing_capability_domain_is_reported_not_substituted`、`#test_known_kind_with_an_unknown_version_says_so`、`#test_an_unauthorised_domain_asks_instead_of_guessing` | `model.test.ts#「read-only, unlaunchable and unsupported stay three different answers」` |
| 预览零副作用 | `test_resolver.py#test_preview_never_reports_applied`、`#test_one_failing_selection_leaves_the_environment_untouched` | —（BE 权威，FE 不替代） |
| 无 props 根视图＋注入端口可独立渲染 | —（BE 无 UI 面） | `entry.test.ts#「the root view needs no props: it loads its own records through the injected port」`、`#「while the data layer is in flight the root says so instead of rendering blank」`、`#「an unavailable data layer is announced, never assumed away」`、`#「a port binds a mountable management view and an opt-in launch entry」` |
| 新测试贡献不改核心 | `test_extensions.py#launch_extension`、`#memory_extension`、`#failing_extension`（夹具提供能力扩展供 resolver/registry 测试使用；该文件本身**没有** `test_` 函数，故此前把它当作"测试名清单"的来源是错的——它提供的是贡献面，不是断言面） | `contributions.ts` 侧无核心改动：宿主与共享契约零改动，见 §逐提交路径实证 |
| 图纸复制／导出导入（v0.2:15 补齐面） | `test_store.py#test_clone_copies_content_under_a_new_id_at_revision_one`、`#test_clone_keeps_unknown_values_byte_for_byte`、`#test_clone_can_name_the_revision_it_copies`、`#test_clone_refuses_to_clobber_or_copy_nothing`；`test_portable.py#test_round_trip_keeps_what_this_package_does_not_understand`、`#test_a_bundle_carries_only_blueprints`、`#test_one_bad_record_refuses_the_whole_bundle_without_writing`、`#test_import_never_overwrites_an_existing_blueprint`、`#test_unknown_bundle_field_is_diagnosed_not_dropped`、`#test_malformed_document_is_reported_not_raised_from_parser`、`#test_import_writes_everything_once_it_is_valid` | `demo.test.ts#「the demo stands alone and labels its port as a test port」`、`#「a capability editor is what turns a selection editable, and the unknown one stays readable」` |

一处必须写在这里的**口径提醒**：本表最后一行的导出/导入与复制属 v0.2 增量，尚未过 BC 收件（收件记录只覆盖到 BC-0026 时的 P0/P1 面），因此这两行的证据状态是"本包自跑门通过"，不等于"上级已收件"；四状态仍按 §本表同时固定的三件事实 分账。
