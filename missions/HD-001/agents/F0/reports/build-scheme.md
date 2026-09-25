# F0 研究报告：现有构建机制事实、差距与 Phase 1 迁移/构建方案草案（2026-09-23）

基线 85cc3cd014，全部结论来自本树源码实读（路径随文）。

## 1. 现有机制事实（已验收原型行为）

1. **Workspace 只有 4 个**：apps/desktop、packages/{desktop-host,extension-api,extension-loader}（根 package.json）。foundation-contracts / agent-ui-contracts 不是 workspace，也没有 package.json —— 它们被 `extensions/build.mjs:14-25` 硬编码表当作伪扩展 `ordessa.contracts` / `ordessa.agent-contracts` 打包。
2. **集中式扩展构建**：`extensions/build.mjs` 一张硬编码 11 项表，esbuild bundle+splitting 输出 `extensions/dist/extensions/<id>/{entry.js,manifest.json}`；manifest 由构建脚本内联生成（第 37 行），不是每包静态文件。examples/ 反而是每目录静态 `manifest.json` 拷贝（examples/build.mjs）——"独立构建输入"的既有先例。
3. **依赖共享=宿主 pin + import map**：扩展构建 externals 固定为 `react, react-dom, @ordessa/extension-api, @extensions/*`（extensions/build.mjs:31）；宿主把 react/jsx-runtime/react-dom/react-dom-client/api 五个入口做**一次** splitting 构建到 `dist/renderer/shared/`（apps/desktop/scripts/build.mjs:8-14），`ordessa://desktop` 协议处理器注入单张静态 import map 把裸说明符映射到 `/shared/*.js`、`@extensions/<id>/` 映射到 `/extensions/<id>/`（extension-protocol.ts:7-12,17-24，CSP nonce）。
4. **跨插件契约身份**：contracts 本身是伪扩展，消费方经 `@extensions/ordessa.contracts/contract.js` 引 Token（extensions/commands/src/entry.ts:2、workbench/src/entry.tsx:2、agent-sessions/src/entry.ts:2）。Lumino Token 身份=实例引用（上游 token.ts 实读）→ 这条 import map 单实例链是契约语义的根基，迁移不可破坏。
5. **发现/启用 fail-closed**：Electron 主进程扫 `<dataRoot|bundledRoot>/extensions/*/manifest.json`，parseManifest 校验（id 正则、semver、hostApi==='2'、entry .js、可选 native .js），重复/缺失即 failure；enabled 来自用户 `extensions.json` 完整覆盖，否则 bundled `extensions.json`（= extensions/product.json 拷贝）（electron/extensions.ts 实读；AGENTS.md：用户覆盖永不回写）。
6. **native 通道**：manifest.native 可选；per-extension node 平台 bundle，外部依赖白名单（pi → `@earendil-works/pi-coding-agent` external，由根 node_modules 解析，extensions/build.mjs:8-13）；IPC bridge 以 discovery.installed 收口（native-bridge.ts 实读）。
7. **路径常量消费方**：main.ts:16（bundled=repo/extensions/dist，ORDESSA_EMPTY_HOST=1 关闭）、test-extensions.mjs:27-40（从 extensions/dist 与 examples/dist 拷入临时 userData）。迁移时这些常量必须同步。
8. extensions/agent-preview.json = 全量 11 id enabled 预览；product.json = 仅 foundations 4 id。两者是两个产品变体。
9. extensions/shared/{registry.ts(16行),boundary.tsx(6行)} 是多扩展源码级共享小件。

## 2. 与 PLAN Phase 1 目标布局的差距

| 目标 | 现状 | 差距 |
|---|---|---|
| apps/desktop/{electron,renderer} | apps/desktop/{electron,src} | 目录改名 + tsconfig/vitest/脚本路径同步 |
| platform/{extension-api,extension-host,extension-loader,native-bridge} | packages/extension-api、extension-loader；desktop-host（runtime+shell）；native-bridge.ts 在 apps/desktop/electron | 移动+desktop-host 更名 extension-host+native-bridge 抽包；import 引用点全量同步 |
| contracts/{workbench,commands,settings,connections,agent} | 2 个无 package.json 伪扩展（foundation-contracts 3 域合一文件；agent-ui-contracts connections+agent） | 拆分方式待 C/FC 定（见 §4 决策点 D1） |
| plugins/foundations/{commands,workbench,settings} | extensions/{commands,workbench,settings} | 移动+每包独立 manifest/package/build/tests |
| plugins/connections/{service,status} | extensions/agent-connections（单包） | service/status 拆分属 F1 Phase 2 语义工作；Phase 1 建议整包落 plugins/connections/service（CHARTER 禁空壳占位） |
| plugins/agent/{sessions,conversation,interactions} | extensions/agent-{sessions,conversation,interactions} | 移动+独立化 |
| plugins/connectors/{codex,pi} | extensions/agent-{codex,pi} | 移动+独立化；pi 的 native externals 白名单随包走 |
| products/agent-desktop/{extensions.json,extensions.lock.json} | extensions/product.json + agent-preview.json | extensions.json=product.json 内容迁移；lock 为新生成工件（见 §3）；两个产品变体归属请 FC/C 定（D2） |
| tooling/ | extensions/build.mjs、examples/build.mjs | 移动 + 新增发现式总构建脚本 |

## 3. 独立插件构建 / 依赖共享 / 发布工件方案草案

- **每插件一份四件套**：package.json（private，声明 `ordessa` 段：id、native 入口、native externals 白名单）、静态 manifest.json（构建时拷贝，不再由总脚本内联生成——与 examples 先例一致）、build.mjs（esbuild bundle，externals 固定=宿主 pin 共享集：react/react-dom/@ordessa/extension-api/@extensions/*；native 构建读 package.json 白名单）、tests（vitest 就近，串行遵守全局纪律）。构建产物仍为 `dist/extensions/<id>/{entry.js,manifest.json[,native.js,…]}` 不变，发现/协议层零改动。
- **宿主 pin 共享集只减不增**：跨插件共享仅允许 react、react-dom、@ordessa/extension-api、contracts 运行时模块（经 @extensions/<contracts-id>/ import map）。其余依赖一律打进各插件包内（独立构建后不再有跨包 splitting；重复打包换取插件独立与无重复 React 危险）。extensions/shared/ 22 行小件按消费方复制进各插件，不扩 API、不建新共享包。
- **宿主不枚举业务包**：tooling/build-all.mjs 以 `plugins/**/package.json` glob 发现并串行构建（总仓库脚本，非宿主依赖、不被宿主 import）；apps/desktop/scripts/build.mjs 改为调用 tooling 总脚本（保持今天"app build 先建扩展"的链路与顺序），替代硬编码 11 项表。
- **products/agent-desktop/extensions.lock.json**（新增、生成、运行时不读）：记录每插件 id/version/构建文件 sha256/契约包版本/生成时 base SHA。用途=交付完整性核对；discovery 行为不变（仍只读 extensions.json）。
- ** Lumino/生命周期零改动**：不新增第二调度器；PluginRegistry/Token/Contributions 语义原样迁移。

## 4. 需 C/FC 裁决的决策点

- **D1 contracts 拆分粒度**：方案 a（推荐，Phase 1 更机械）：contracts/ 下 5 个域目录但**保持 2 个运行时插件 id**（ordessa.contracts、ordessa.agent-contracts → 各自 package.json+manifest，域文件拆分纯 re-export），product/enabled 列表不变，风险最低；方案 b：拆成 5 个插件 id（ordessa.contracts.workbench 等），PLAN 目录形制更彻底，但 enabled 列表/插件状态面板可见变化，建议留 Phase 2 由 FC 定。
- **D2 产品变体归属**：product.json（foundations only）与 agent-preview.json（全量 11 id）→ products/agent-desktop/extensions.json 取哪个为默认？本任务目标"整机成为 Harness Desktop"暗示全量，属产品决策，请 FC/C 定；lock 与所选变体配套。
- **D3 包名改动**：@modular/desktop-host → @ordessa/extension-host（或保留原名只移目录）。改名波及全部 import 点，机械但面广；建议随 Phase 1 一次做完。

## 5. 验证方式（Phase 1 批准后的验收口径）

1. 迁移后 build/typecheck/test/test:extensions/test:foundations/test:electron 全绿（Electron smoke 用隔离临时 userData+测试专用 --no-sandbox，串行）。
2. `ORDESSA_EMPTY_HOST=1` 与默认两种启动均可用；examples/build.mjs 仍独立可建。
3. dist 产物逐字节可比对（除新 lock 文件）：迁移前后 entry.js/manifest.json 内容一致 = 行为未漂移的直接证据。
4. 新发现式总构建脚本产物与硬编码表产物一致。
