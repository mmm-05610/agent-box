# F0 · FE-PREP 研究交付 — 独立包构建契约与机械迁移步骤清单（2026-09-23）

基线 85cc3cd014（clean）。履行 FC-0002 派件（C-GRANT-R1 内，仅研究）；全部结论出自本树源码实读。机制事实详见 reports/build-scheme.md §1，复用账见 reports/reuse.md。未批不动树。

## 1. FC §5 迁移映射核对（逐行）

| FC §5 行 | F0 核对结论 |
|---|---|
| apps/desktop/src → renderer；electron 保留 | ✅ 可机械执行。需同步：tsconfig include、vitest.config、apps/desktop/scripts/build.mjs 与各脚本相对路径、smoke 引用。 |
| extension-api → platform/extension-api；extension-loader → platform/extension-loader | ✅ workspace 包整体移动，exports 不变（".""./manifest"），依赖方 import 名不变。 |
| desktop-host + electron 侧 extension-protocol/extensions 装载 → platform/extension-host | ✅ 采纳，附执行要点：runtime.ts/shell.tsx（renderer 侧）与 extensions.ts(discovery)/extension-protocol.ts（Electron main 侧）合并入一个包需用子路径 exports 区分运行面（`.`=renderer TS 源，`./main`=main 侧 TS 源）；两侧都是 esbuild 从 TS 源打包，无运行时互引，单一 package.json 安全。包名见 §5-D3。 |
| electron/native-bridge → platform/native-bridge | ✅ 纯 main 侧，独立包（deps：electron peer + @ordessa/extension-loader/manifest 用于类型？实查：native-bridge.ts 只 import electron/crypto + ./extensions 类型 → 移动后改从 platform/extension-host 的 `./main` 取类型）。 |
| foundation-contracts 拆 → contracts/{workbench,commands,settings}；agent-ui-contracts 拆 → contracts/{connections,agent} | ✅ 按 **C-0011/HD-001-C-005 D1=方案 a** 执行：contracts/ 下建 5 个域目录，**保持 2 个运行时插件 id**（ordessa.contracts、ordessa.agent-contracts），域文件纯移动+re-export，product/enabled 列表不变；5-id 拆分留 Phase 2 由 FC 提案。硬约束（Lumino token.ts 实读）：Token 身份=实例引用 → **每个 contracts 包仍是单一运行时模块**，消费方只经 import map `@extensions/<id>/…` 引用，禁止打进消费插件；Token 字符串（'ordessa.commands.v1' 等）不变。即 2 个 contracts 包（package.json+静态 manifest+build.mjs），各含多域 re-export 源文件。 |
| agent-connections → plugins/connections/{service,status} | ⚠️ **部分采纳，建议偏离**：实测 entry.ts 仅 30 行纯服务（connector registry+connect，无任何 UI）；status UI 今天不存在（F1 Phase 2 才建）。Phase 1 机械迁移拆出 status 会造空壳插件，违反 CHARTER"不创建空壳/占位"。建议：Phase 1 整包落 `plugins/connections/service`（id 不变），status 拆分随 F1 Phase 2 实施批。 |
| agent-{sessions,conversation,interactions} → plugins/agent/*；agent-{codex,pi} → plugins/connectors/* | ✅ 一一对应机械移动；pi 的 native externals 白名单（@earendil-works/pi-coding-agent）随包声明（见 §2）。 |
| product.json/agent-preview.json → products/agent-desktop/ + 生成 lock | ✅ 见 §2 lock 语义。**待 C/FC 裁决 D2**：extensions.json 默认内容取 product.json（foundations 4 id）还是 agent-preview.json（全量 11→拆分后 14 id）。本任务目标"整机成为 Harness Desktop"暗示全量，但属产品决策。 |
| extensions/build.mjs + apps/desktop/scripts → tooling/ | ⚠️ **部分采纳**：构建编排类移动（extensions/build.mjs 退役→tooling/ 每插件构建+发现式总脚本；examples/build.mjs→tooling/）；但 run-dev/smoke-electron/launch-smoke/test-agent-*/test-extensions/test-foundations 属应用生命周期与应用级集成门，PLAN 明文"保留应用级集成门"，且被 apps/desktop package.json scripts 引用——建议留在 apps/desktop/scripts（=应用级门），tooling/ 只放跨包构建工具。 deviation 已列 §5-D4 供 C 定。 |
| extensions/shared → 插件间共享小件，随 F0 定夺 | ✅ 定夺：registry.ts(16行)/boundary.tsx(6行) 按消费方**复制**进各插件（不建新共享包、不扩 extension-api 公共面、不进宿主）；消费方实查：registry.ts 被 commands/entry.ts、agent-connections/entry.ts 等 import（`../../shared/registry`），boundary.tsx 待逐包 grep 后按同法复制。22 行复制成本低于新依赖边。 |
| 旧测试按所有者迁回各包；保留应用级集成门 | ✅ 具体清单见 §3。 |
| assistant-ui devDep→正式依赖 | ✅ 同意：per-plugin 包化后由 plugins/agent/conversation/package.json 声明依赖（根 workspace 提升安装），根 package.json 该 devDep 可移除或保留由 FC 安排（涉及 package-lock，归 FC 串行）。react-resizable-panels 同理归 workbench 包。 |

## 2. 独立包构建契约（事实表：每包四件套与依赖方向）

对每个目标包（platform/* 4、contracts/* 2 包含 5 域目录、plugins/* 9、products/agent-desktop、tooling/）：

- **manifest**：plugins/* 与 contracts/* 每包静态 `manifest.json`（id/version/hostApi='2'/entry），构建时拷贝，不再由总脚本内联生成（examples 先例）。platform/*、tooling/、products/ 无 manifest（非运行时插件；contracts 虽是 Token 库但必须以插件形态被 discovery 装载才能进 import map——现 ordessa.contracts 即如此）。
- **package.json**：每包 private + `"ordessa"` 段声明 {id, native 入口?, native externals?}（替代现 extensions/build.mjs natives 硬编码表，pi 外部依赖随包走）。依赖方向单向：plugins → contracts、@ordessa/extension-api（均 external）→ 不得插件间互 import 源码（运行时如需跨插件只能经 Token 服务）；contracts → 仅 @ordessa/extension-api；platform/extension-api → 仅 Lumino；platform/{extension-host,extension-loader,native-bridge} → extension-api（+extension-host./main → extension-loader/manifest）；apps/desktop(renderer+electron) → platform/* + Lumino。宿主（apps/desktop、platform/*）**不得** import 任何 plugins/*/contracts 业务源码——现 apps/desktop/src 无此 import（实查 .test.tsx 的 @extensions/ordessa.contracts 引用为 vitest 内 import map mock，见 §3 loader.test）。
- **build**：每包 build.mjs（esbuild bundle，esm，jsx automatic；externals 固定=宿主 pin 共享集 react/react-dom/@ordessa/extension-api/@extensions/*）；native 构建读包声明（node22）。跨包 splitting 共享随独立构建消失 → pin 集外依赖一律包内打包。产物布局不变：`<bundled>/extensions/<id>/{entry.js,manifest.json[,native.js]}`，discovery/protocol/import map 零改动。
- **tests**：见 §3。
- **发现式总构建**：tooling/build-all.mjs 以 glob `plugins/**/package.json`（含 `ordessa` 段）发现并**串行**构建 + 生成 products/agent-desktop/extensions.lock.json（id/version/文件 sha256/生成时 base SHA；运行时不读，仅交付核对——extensions.json 为唯一运行时 enabled 源）。apps/desktop build 链改为调用 tooling 总脚本，保持"先建扩展再建应用"顺序。
- **products/agent-desktop/extensions.json**：静态产品文件；按 **C-0011/HD-001-C-005 D2**：运行默认=原 agent-preview.json 全量内容（11 id），foundations-only（原 product.json）保留为附属文件不删；lock 随默认变体生成。用户 userData 覆盖机制不变、永不回写（AGENTS.md）。

## 3. 旧测试所有权迁移清单（实测 import 出处）

**随包走（包内 vitest，串行纪律继承）**
| 测试 | 新归属 | 依据 |
|---|---|---|
| src/agent-connections.test.ts | plugins/connections/service | import agent-connections/src/entry |
| src/agent-sessions.test.ts | plugins/agent/sessions | import agent-sessions/model + agent-connections/entry（经包依赖引用，不得复制源码） |
| src/agent-codex.test.ts | plugins/connectors/codex | import agent-codex/src/client |
| src/agent-pi.test.ts | plugins/connectors/pi | import agent-pi/src/client |
| src/agent-ui-probe.test.tsx | plugins/agent/conversation | import examples/agent-ui-probe/{view,store} 作 fixture（examples 保持独立构建输入，允许测试引用） |

**留 apps/desktop 作应用级集成门（PLAN 明文保留；import 路径改指新包）**
| 测试 | 覆盖面 |
|---|---|
| src/loader.test.ts | discover/confinedFile/protocolHandler/loadExtensions 全链（import 平台新路径） |
| src/host.test.tsx | App+runtime 装配 |
| src/foundation.test.tsx | runtime+workbench+settings+contracts 混合集成 |
| scripts/test-agent-{ui,shell,process}.mjs、test-foundations.mjs、test-extensions.mjs | Electron/冒烟/发现集成门（隔离 userData、测试专用 --no-sandbox） |
| scripts/{run-dev,smoke-electron,launch-smoke}.mjs | 应用生命周期，留在 apps/desktop/scripts（见 D4） |

## 4. 机械迁移步骤清单（批准后可执行；每步保持树可构建）

1. platform/：git mv packages/extension-api→platform/extension-api、packages/extension-loader→platform/extension-loader；desktop-host→platform/extension-host（+electron/{extensions,extension-protocol}.ts 移入 `platform/extension-host/src/main/`，exports 子路径区分）；electron/native-bridge.ts→platform/native-bridge；根 workspaces 数组同步。
2. contracts/：foundation-contracts/contract.ts 拆 3 域文件+agent-ui-contracts 拆 2 域文件（纯移动+re-export，Token 字符串不变）；建 **2 个 contracts 包**（ordessa.contracts、ordessa.agent-contracts；package.json+静态 manifest+build.mjs），各含 5 域目录的 re-export（D1=方案 a，enabled 列表不变）。
3. plugins/：11 目录按 §1 映射 git mv（connections 整包→service）；每包补 package.json（含 ordessa 段）+静态 manifest.json+build.mjs+tests 移入；shared/ 小件复制进消费包。
4. products/agent-desktop/：迁移 product.json→extensions.json、agent-preview.json；lock 由 tooling 生成。
5. tooling/：新 build-all.mjs（glob 发现+串行+lock 生成）；examples/build.mjs 移入；退役 extensions/build.mjs。
6. apps/desktop：src→renderer；scripts/build.mjs 改调 tooling；tsconfig/vitest/package.json scripts/测试 import 路径同步；electron/main.ts:16 bundled 路径改为 `../../products`（或 tooling 输出根，与 4 对齐）。
7. D2 连带（FC-0007 指出，采纳）：D2 默认切换后 test-extensions.mjs 等夹具不再隐式依赖 product.json 的 bundled 默认，改显式 id 列表，避免测试隐式耦合产品配置；foundations-only 变体归 tooling 测试夹具。
8. 全绿验证（build/typecheck/test/test:extensions/test:foundations/test:electron 串行）+ 产物字节级比对（lock 除外）+ ORDESSA_EMPTY_HOST 双模启动。

## 5. 裁决记录与遗留待定（2026-09-23 更新）

**C-0011/HD-001-C-005 已裁决（本报告吸收完毕）**：
- **D1 = 方案 a**：contracts 5 域目录、2 个运行时插件 id 不变，域文件纯 re-export；5-id 拆分留 Phase 2（FC 提案）。（我早先 F0-0002 提案即方案 a，FE 侧曾倾向 5 包，以 C 裁决为准。）
- **D2 = 全量默认**：products/agent-desktop/extensions.json 默认=原 agent-preview.json（11 id）；foundations-only 保留为附属文件；lock 随默认变体生成。
- **D3 = 采纳**：@modular/desktop-host → @ordessa/extension-host 更名，Phase 1 一次做完。
- **附带认可**：connections Phase 1 整包落 service；宿主 pin 共享集只减不增；extensions/shared 按消费方复制不建新共享包；lock 运行时不读仅交付核对。

**遗留待 FC 汇合 PROPOSAL 正式化**：
- **D4（F0 建议，未单列裁决）**：apps/desktop/scripts 只移构建编排入 tooling/，run-dev/smoke/test 集成门留 apps/desktop（理由见 §1 表与 §3）。
- FE-PREP 实施批文的精确路径清单、"其余 FE 组停写"安排与验收口径（C-0011 已确认验收含 F0 §5→现 §4 步骤 7 的 dist 逐字节比对等五条）。
